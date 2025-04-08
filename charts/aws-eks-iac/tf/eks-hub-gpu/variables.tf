variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-2"
}

variable "cluster_name" {
  description = "Cluster name"
  type        = string
  default     = "eks-cluster"
}

variable "k8s_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.31"
}

variable "instance_type_default" {
  description = "Instance type"
  type        = string
  default     = "t3.xlarge"
}

variable "instance_type_gpu" {
  description = "Instance type"
  type        = string
  default     = "g4dn.4xlarge"
}

variable "vpc_cidr" {
  description = "value of the VPC CIDR"
  type        = string
  default     = "10.0.0.0/16"
}

variable "ami_type" {
  description = "AMI type"
  type        = string
  default     = "AL2_x86_64_GPU"
}