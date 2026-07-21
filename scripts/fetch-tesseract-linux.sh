#!/bin/bash
# ===================================================================
# Tesseract Linux 资源下载脚本
# 下载预编译 Tesseract 5.x 及依赖库到 src-tauri/resources/tesseract-linux/
# 适用平台: Linux x86_64 (Debian/Ubuntu 等基于 apt 的发行版)
# ===================================================================

set -euo pipefail

# === 路径变量 ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$PROJECT_ROOT/src-tauri/resources/tesseract-linux"
TESSDATA_DIR="$TARGET_DIR/tessdata"
TEMP_DIR="$(mktemp -d)"

# === 下载源 ===
# tessdata_fast 仓库（文件更小，下载更快）
TESSDATA_BASE_URL="https://github.com/tesseract-ocr/tessdata_fast/raw/main"

# 训练数据列表（中文简体 + 英文）
TESSDATA_FILES=(
    "chi_sim.traineddata"
    "eng.traineddata"
)

# 需要下载的 .deb 包（运行时依赖）
# tesseract-ocr: 主程序（含可执行文件）
# libtesseract5: Tesseract 共享库
# liblept5: Leptonica 图像处理库（Tesseract 的核心依赖）
DEB_PACKAGES=(
    "tesseract-ocr"
    "libtesseract5"
    "liblept5"
)

# === 清理函数 ===
cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        echo "[清理] 删除临时目录: $TEMP_DIR"
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# === 工具函数 ===

# 下载文件（带缓存机制）
# 用法: download_file <url> <dest>
download_file() {
    local url="$1"
    local dest="$2"
    # 缓存检查：目标文件已存在且非空则跳过下载
    if [[ -f "$dest" && -s "$dest" ]]; then
        echo "[缓存] 跳过已存在文件: $(basename "$dest")"
        return 0
    fi
    echo "[下载] $url"
    mkdir -p "$(dirname "$dest")"
    # 下载到 .tmp 临时文件，成功后重命名（避免半成品文件被误认为已完成）
    curl -L --fail --progress-bar -o "$dest.tmp" "$url"
    mv "$dest.tmp" "$dest"
}

# 校验文件大小（基本完整性检查）
# 用法: check_file_size <file> <min_size_bytes>
check_file_size() {
    local file="$1"
    local min_size="$2"
    local actual_size
    # 兼容 GNU stat (Linux) 和 BSD stat (macOS)
    actual_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null)
    if [[ "$actual_size" -lt "$min_size" ]]; then
        echo "[错误] 文件大小校验失败: $file"
        echo "       实际: $actual_size 字节，期望最小: $min_size 字节"
        return 1
    fi
    echo "[校验] $(basename "$file"): $actual_size 字节"
}

# 通过 apt 下载 .deb 包并解压到临时目录
# 用法: apt_download_and_extract <package_name>
apt_download_and_extract() {
    local pkg="$1"
    local deb_file

    echo "[apt] 下载包: $pkg"
    # apt download 不需要 root 权限，下载到当前目录
    (cd "$TEMP_DIR" && apt download "$pkg" 2>/dev/null)

    # 查找下载的 .deb 文件（包名_版本_arch.deb 格式）
    deb_file=$(find "$TEMP_DIR" -maxdepth 1 -name "${pkg}_*.deb" | head -1)
    if [[ -z "$deb_file" ]]; then
        echo "[错误] 未能下载包: $pkg（可能该包名在当前发行版中不存在）"
        return 1
    fi

    # 校验下载的文件大小（至少 1KB）
    check_file_size "$deb_file" 1024

    # 解压 .deb 文件（ar 归档格式）
    echo "[解压] $(basename "$deb_file")"
    (cd "$TEMP_DIR" && ar x "$(basename "$deb_file")")

    # 解压 data.tar.* 文件（包含实际的二进制和库）
    for data_tar in "$TEMP_DIR"/data.tar.*; do
        [[ -f "$data_tar" ]] || continue
        tar xf "$data_tar" -C "$TEMP_DIR"
        rm -f "$data_tar"
    done

    # 清理 .deb 控制文件
    rm -f "$TEMP_DIR"/debian-binary "$TEMP_DIR"/control.tar.*
}

# === 主流程 ===

echo "=== Tesseract Linux 资源下载脚本 ==="
echo "目标目录: $TARGET_DIR"
echo ""

# 检测平台（非 Linux 时给出警告但仍可继续，便于在 WSL 等环境中使用）
if [[ "$(uname -s)" != "Linux" ]]; then
    echo "[警告] 当前平台不是 Linux（$(uname -s)），脚本可能无法正常工作"
fi
echo "[信息] 架构: $(uname -m)"
echo ""

# 创建目标目录
mkdir -p "$TESSDATA_DIR"

# --- 步骤1: 下载 tessdata 训练数据 ---
echo "--- 步骤1: 下载 tessdata 训练数据 ---"
for file in "${TESSDATA_FILES[@]}"; do
    url="$TESSDATA_BASE_URL/$file"
    dest="$TESSDATA_DIR/$file"
    download_file "$url" "$dest"
    # traineddata 文件至少应大于 1MB（chi_sim 约 12MB，eng 约 11MB）
    check_file_size "$dest" 1000000
done

# --- 步骤2: 通过 apt 下载 tesseract .deb 包 ---
echo ""
echo "--- 步骤2: 通过 apt 下载 tesseract .deb 包 ---"

# 检查 apt-get 是否可用
if ! command -v apt-get >/dev/null 2>&1; then
    echo "[错误] 未检测到 apt-get，本脚本仅支持 Debian/Ubuntu 及其衍生发行版"
    echo "       其他发行版请手动下载 tesseract 二进制和依赖库到 $TARGET_DIR"
    exit 1
fi

# 检查 ar 工具是否可用（解压 .deb 文件需要 ar，包含在 binutils 包中）
if ! command -v ar >/dev/null 2>&1; then
    echo "[错误] 未检测到 ar 工具，请安装 binutils: sudo apt install binutils"
    exit 1
fi

# 下载并解压所有 .deb 包
for pkg in "${DEB_PACKAGES[@]}"; do
    apt_download_and_extract "$pkg"
done

# --- 步骤3: 复制二进制和库到目标目录 ---
echo ""
echo "--- 步骤3: 复制文件到目标目录 ---"

# 复制 tesseract 可执行文件
if [[ -f "$TEMP_DIR/usr/bin/tesseract" ]]; then
    cp "$TEMP_DIR/usr/bin/tesseract" "$TARGET_DIR/tesseract"
    echo "[复制] tesseract 可执行文件"
else
    echo "[警告] 未找到 tesseract 可执行文件（usr/bin/tesseract）"
fi

# 复制 Tesseract 共享库（libtesseract*.so*）
find "$TEMP_DIR/usr/lib" -name "libtesseract*.so*" -type f 2>/dev/null | while read -r lib; do
    cp "$lib" "$TARGET_DIR/"
    echo "[复制] $(basename "$lib")"
done

# 复制 Leptonica 共享库（liblept*.so*，Tesseract 的图像处理依赖）
find "$TEMP_DIR/usr/lib" -name "liblept*.so*" -type f 2>/dev/null | while read -r lib; do
    cp "$lib" "$TARGET_DIR/"
    echo "[复制] $(basename "$lib")"
done

# --- 步骤4: 设置可执行权限 ---
echo ""
echo "--- 步骤4: 设置可执行权限 ---"
if [[ -f "$TARGET_DIR/tesseract" ]]; then
    chmod +x "$TARGET_DIR/tesseract"
    echo "[权限] tesseract 已设置为可执行"
fi

# --- 完成 ---
echo ""
echo "=== 下载完成 ==="
echo "Tesseract 资源目录: $TARGET_DIR"
echo ""
echo "目录内容:"
ls -la "$TARGET_DIR"
echo ""
echo "tessdata 目录内容:"
ls -la "$TESSDATA_DIR"
echo ""
echo "[注意] 在 Tauri 应用中打包这些资源时，需要在"
echo "       src-tauri/tauri.linux.conf.json 的 bundle.resources 中配置路径，"
echo "       并修改 OCR 模块在 Linux 平台优先使用捆绑版本。"
