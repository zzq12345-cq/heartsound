#!/bin/bash
# ============================================
# Dify 部署脚本
# 心音智鉴 AI 健康助手平台
# ============================================
#
# 使用方法:
#   chmod +x deploy.sh
#   ./deploy.sh [命令]
#
# 可用命令:
#   start   - 启动所有服务
#   stop    - 停止所有服务
#   restart - 重启所有服务
#   logs    - 查看日志
#   status  - 查看状态
#   clean   - 清理数据（危险操作）

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 打印带颜色的消息
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查 Docker 环境
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker 未安装，请先安装 Docker"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose 未安装，请先安装 Docker Compose"
        exit 1
    fi

    print_success "Docker 环境检查通过"
}

# 检查环境变量文件
check_env() {
    if [ ! -f ".env" ]; then
        print_warning ".env 文件不存在，从 .env.example 复制"
        cp .env.example .env
        print_warning "请编辑 .env 文件，修改默认配置"
    fi
}

# 创建必要目录
create_dirs() {
    mkdir -p storage ssl
    print_success "目录创建完成"
}

# 启动服务
start_services() {
    print_info "正在启动 Dify 服务..."

    if docker compose version &> /dev/null; then
        docker compose up -d
    else
        docker-compose up -d
    fi

    print_success "服务启动完成"
    print_info "等待服务就绪..."
    sleep 10

    show_status

    echo ""
    print_info "访问地址: http://localhost"
    print_info "首次访问需要创建管理员账号"
}

# 停止服务
stop_services() {
    print_info "正在停止 Dify 服务..."

    if docker compose version &> /dev/null; then
        docker compose down
    else
        docker-compose down
    fi

    print_success "服务已停止"
}

# 重启服务
restart_services() {
    print_info "正在重启 Dify 服务..."
    stop_services
    start_services
}

# 查看日志
show_logs() {
    local service=$1

    if docker compose version &> /dev/null; then
        if [ -n "$service" ]; then
            docker compose logs -f "$service"
        else
            docker compose logs -f
        fi
    else
        if [ -n "$service" ]; then
            docker-compose logs -f "$service"
        else
            docker-compose logs -f
        fi
    fi
}

# 查看状态
show_status() {
    print_info "服务状态:"
    echo ""

    if docker compose version &> /dev/null; then
        docker compose ps
    else
        docker-compose ps
    fi
}

# 清理数据
clean_data() {
    print_warning "警告: 此操作将删除所有数据，包括数据库和存储的文件!"
    read -p "确定要继续吗? (输入 'yes' 确认): " confirm

    if [ "$confirm" != "yes" ]; then
        print_info "操作已取消"
        exit 0
    fi

    print_info "正在停止服务..."
    stop_services

    print_info "正在删除数据卷..."
    if docker compose version &> /dev/null; then
        docker compose down -v
    else
        docker-compose down -v
    fi

    print_info "正在删除本地存储..."
    rm -rf storage/*

    print_success "清理完成"
}

# 拉取最新镜像
pull_images() {
    print_info "正在拉取最新镜像..."

    if docker compose version &> /dev/null; then
        docker compose pull
    else
        docker-compose pull
    fi

    print_success "镜像拉取完成"
}

# 显示帮助
show_help() {
    echo "Dify 部署脚本 - 心音智鉴 AI 健康助手平台"
    echo ""
    echo "使用方法: ./deploy.sh [命令]"
    echo ""
    echo "可用命令:"
    echo "  start     启动所有服务"
    echo "  stop      停止所有服务"
    echo "  restart   重启所有服务"
    echo "  logs      查看所有服务日志"
    echo "  logs api  查看指定服务日志"
    echo "  status    查看服务状态"
    echo "  pull      拉取最新镜像"
    echo "  clean     清理所有数据（危险操作）"
    echo "  help      显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  ./deploy.sh start    # 启动服务"
    echo "  ./deploy.sh logs api # 查看 API 服务日志"
}

# 主函数
main() {
    local command=$1
    local arg=$2

    case $command in
        start)
            check_docker
            check_env
            create_dirs
            start_services
            ;;
        stop)
            stop_services
            ;;
        restart)
            check_docker
            restart_services
            ;;
        logs)
            show_logs "$arg"
            ;;
        status)
            show_status
            ;;
        pull)
            check_docker
            pull_images
            ;;
        clean)
            clean_data
            ;;
        help|--help|-h)
            show_help
            ;;
        "")
            show_help
            ;;
        *)
            print_error "未知命令: $command"
            show_help
            exit 1
            ;;
    esac
}

main "$@"
