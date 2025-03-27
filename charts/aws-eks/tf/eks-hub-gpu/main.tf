provider "aws" {
  region = var.region
  shared_credentials_files = ["aws-creds.ini"]
}


data "aws_eks_cluster_auth" "cluster" {
  name = var.cluster_name
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    token                  = data.aws_eks_cluster_auth.cluster.token
  }
}

provider "kubectl" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  token                  = data.aws_eks_cluster_auth.cluster.token
  load_config_file       = false
}

data "aws_availability_zones" "available" {}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 3)
}

################################################################################
# Cluster
################################################################################

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name                   = var.cluster_name
  cluster_version                = var.k8s_version
  cluster_endpoint_public_access = true

  enable_cluster_creator_admin_permissions = true

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

}

module "eks_managed_node_group_default" {
  source  = "terraform-aws-modules/eks/aws//modules/eks-managed-node-group"
  version = "~> 20.0"

  name            = "managed-ng-default"
  ami_type        = var.ami_type
  cluster_name    = var.cluster_name
  cluster_version = var.k8s_version

  subnet_ids = module.vpc.private_subnets

  cluster_primary_security_group_id = module.eks.cluster_security_group_id
  vpc_security_group_ids            = [module.eks.node_security_group_id]
  cluster_service_cidr              = module.eks.cluster_service_cidr

  instance_types = [var.instance_type_default]

  min_size     = 2
  max_size     = 2
  desired_size = 2

  enable_bootstrap_user_data = false

  pre_bootstrap_user_data = <<-EOT
    #!/bin/bash
    LINE_NUMBER=$(grep -n "KUBELET_EXTRA_ARGS=\$2" /etc/eks/bootstrap.sh | cut -f1 -d:)
    REPLACEMENT="\ \ \ \ \ \ KUBELET_EXTRA_ARGS=\$(echo \$2 | sed -s -E 's/--max-pods=[0-9]+/--max-pods=100/g')"
    sed -i '/KUBELET_EXTRA_ARGS=\$2/d' /etc/eks/bootstrap.sh
    sed -i "$${LINE_NUMBER}i $${REPLACEMENT}" /etc/eks/bootstrap.sh
  EOT
}

module "eks_managed_node_group_gpu" {
  source  = "terraform-aws-modules/eks/aws//modules/eks-managed-node-group"
  version = "~> 20.0"

  name            = "managed-ng-gpu"
  ami_type        = var.ami_type
  cluster_name    = var.cluster_name
  cluster_version = var.k8s_version

  subnet_ids = module.vpc.private_subnets

  cluster_primary_security_group_id = module.eks.cluster_security_group_id
  vpc_security_group_ids            = [module.eks.node_security_group_id]
  cluster_service_cidr              = module.eks.cluster_service_cidr

  instance_types = [var.instance_type_gpu]

  min_size     = 1
  max_size     = 1
  desired_size = 1

  labels = {
    "nvidia.com/mps.capable" = true
    "nvidia.com/gpu.present" = true
  }

  taints = [
    {
      key    = "nvidia.com/gpu"
      value  = "true"
      effect = "NO_SCHEDULE"
    }
  ]

  enable_bootstrap_user_data = false
}

################################################################################
# EKS Blueprints Addons
################################################################################

module "eks_blueprints_addons" {
  source  = "aws-ia/eks-blueprints-addons/aws"
  version = "~> 1.14"

  cluster_name      = module.eks.cluster_name
  cluster_endpoint  = module.eks.cluster_endpoint
  cluster_version   = module.eks.cluster_version
  oidc_provider_arn = module.eks.oidc_provider_arn

  create_delay_dependencies = [module.eks_managed_node_group_default.node_group_arn]

  eks_addons = {
    coredns    = {}
    kube-proxy = {}
  }

  enable_velero = false
}

################################################################################
# Supporting Resources
################################################################################

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = var.cluster_name
  cidr = var.vpc_cidr

  azs             = local.azs
  private_subnets = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 4, k)]
  public_subnets  = [for k, v in local.azs : cidrsubnet(var.vpc_cidr, 8, k + 48)]

  enable_nat_gateway = true
  single_nat_gateway = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

resource "kubectl_manifest" "nvidia_device_plugin" {
    yaml_body = <<YAML
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nvidia-device-plugin-daemonset
  namespace: kube-system
spec:
  selector:
    matchLabels:
      name: nvidia-device-plugin-ds
  updateStrategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        name: nvidia-device-plugin-ds
    spec:
      tolerations:
      - key: "sku"
        operator: "Equal"
        value: "gpu"
        effect: "NoSchedule"
      # Mark this pod as a critical add-on; when enabled, the critical add-on
      # scheduler reserves resources for critical add-on pods so that they can
      # be rescheduled after a failure.
      # See https://kubernetes.io/docs/tasks/administer-cluster/guaranteed-scheduling-critical-addon-pods/
      priorityClassName: "system-node-critical"
      containers:
      - image: nvcr.io/nvidia/k8s-device-plugin:v0.15.0
        name: nvidia-device-plugin-ctr
        env:
          - name: FAIL_ON_INIT_ERROR
            value: "false"
        securityContext:
          allowPrivilegeEscalation: false
          capabilities:
            drop: ["ALL"]
        volumeMounts:
        - name: device-plugin
          mountPath: /var/lib/kubelet/device-plugins
      volumes:
      - name: device-plugin
        hostPath:
          path: /var/lib/kubelet/device-plugins
YAML
}