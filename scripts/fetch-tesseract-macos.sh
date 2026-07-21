#!/bin/bash
# ===================================================================
# Tesseract macOS 资源下载脚本
# 下载预编译 Tesseract 5.x 及依赖库到 src-tauri/resources/tesseract-macos/
# 适用平台: macOS（Intel x86_64 与 Apple Silicon arm64）
# ===================================================================

set -euo pipefail

# === 路径变量 ===
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$PROJECT_ROOT/src-tauri/resources/tesseract-macos"
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
    # 兼容 BSD stat (macOS) 和 GNU stat (Linux)
    actual_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
    if [[ "$actual_size" -lt "$min_size" ]]; then
        echo "[错误] 文件大小校验失败: $file"
        echo "       实际: $actual_size 字节，期望最小: $min_size 字节"
        return 1
    fi
    echo "[校验] $(basename "$file"): $actual_size 字节"
}

# === 主流程 ===

echo "=== Tesseract macOS 资源下载脚本 ==="
echo "目标目录: $TARGET_DIR"
echo ""

# 检测平台
if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "[警告] 当前平台不是 macOS（$(uname -s)），脚本可能无法正常工作"
fi
ARCH=$(uname -m)
echo "[信息] 架构: $ARCH"
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

# --- 步骤2: 通过 Homebrew 获取 Tesseract ---
echo ""
echo "--- 步骤2: 通过 Homebrew 获取 Tesseract ---"

# 检查 Homebrew 是否可用
if ! command -v brew >/dev/null 2>&1; then
    echo "[错误] 未检测到 Homebrew"
    echo "       请先安装 Homebrew: https://brew.sh/"
    echo "       安装完成后重新运行此脚本"
    exit 1
fi

# 安装 tesseract（如果尚未安装）
if ! brew list tesseract >/dev/null 2>&1; then
    echo "[brew] 安装 tesseract..."
    brew install tesseract
else
    echo "[brew] tesseract 已安装"
fi

# 获取 brew 安装路径
BREW_PREFIX=$(brew --prefix tesseract)
echo "[信息] Tesseract 安装路径: $BREW_PREFIX"

# --- 步骤3: 复制二进制和库到目标目录 ---
echo ""
echo "--- 步骤3: 复制文件到目标目录 ---"

# 复制 tesseract 可执行文件
if [[ -f "$BREW_PREFIX/bin/tesseract" ]]; then
    cp "$BREW_PREFIX/bin/tesseract" "$TARGET_DIR/tesseract"
    echo "[复制] tesseract 可执行文件"
else
    echo "[警告] 未找到 tesseract 可执行文件（$BREW_PREFIX/bin/tesseract）"
fi

# 复制 Tesseract 共享库（libtesseract*.dylib）
find "$BREW_PREFIX/lib" -name "libtesseract*.dylib" -type f 2>/dev/null | while read -r lib; do
    cp "$lib" "$TARGET_DIR/"
    echo "[复制] $(basename "$lib")"
done

# 复制 Leptonica 共享库（libleptonica*.dylib，Tesseract 的图像处理依赖）
find "$BREW_PREFIX/lib" -name "libleptonica*.dylib" -type f 2>/dev/null | while read -r lib; do
    cp "$lib" "$TARGET_DIR/"
    echo "[复制] $(basename "$lib")"
done

# 复制常见的运行时依赖库（tesseract 通过 brew install 间接依赖这些库）
# 包括图像解码库、压缩库等
DEPENDENCY_LIB_PATTERNS=(
    "libgif"
    "libjpeg"
    "libpng"
    "libtiff"
    "libwebp"
    "liblzma"
    "libzstd"
    "liblz4"
    "libopenjp2"
)
for pattern in "${DEPENDENCY_LIB_PATTERNS[@]}"; do
    find "$BREW_PREFIX/lib" -name "${pattern}*.dylib" -type f 2>/dev/null | while read -r lib; do
        cp "$lib" "$TARGET_DIR/"
        echo "[复制] $(basename "$lib")"
    done
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
echo "       src-tauri/tauri.macos.conf.json 的 bundle.resources 中配置路径，"
echo "       并修改 OCR 模块在 macOS 平台优先使用捆绑版本。"
echo "[注意] macOS 应用的动态库依赖路径需要使用 install_name_tool 修改，"
echo "       使其指向 @executable_path/ 或 @loader_path/，否则可能无法加载。"
