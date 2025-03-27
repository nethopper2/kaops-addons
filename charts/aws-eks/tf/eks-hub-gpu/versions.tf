terraform {
  required_version = ">= 1.3"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.34"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.9"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = ">= 2.20"
    }
    kubectl = {
      source  = "gavinbunney/kubectl"
      version = ">= 1.7.0"
    }
  }
  
  # backend "kubernetes" {
  #   secret_suffix     = "providerconfig-default"
  #   namespace         = "default"
  #   in_cluster_config = true
  # }
  backend "s3" {
    bucket = "pov-bedrock-tfstate"
    region = "us-east-2"
    key    = "eks-hub-gpu/terraform.tfstate"
  }
}
