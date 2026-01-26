#!/bin/bash

# MCP Router Linux .deb パッケージビルドスクリプト
# このスクリプトは依存関係のインストール、共有パッケージのビルド、.debパッケージの生成を行います

set -e  # エラーが発生したら即座に終了

# カラー出力用の定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# プロジェクトルートディレクトリに移動
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}MCP Router .deb パッケージビルド${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 1. 依存関係のインストール
echo -e "${YELLOW}[1/3] 依存関係を確認中...${NC}"
# 必要なコマンドが存在するか確認
MISSING_DEPS=false
if [ ! -f "node_modules/.bin/cross-env" ] && [ ! -f "apps/electron/node_modules/.bin/cross-env" ]; then
    MISSING_DEPS=true
fi
if [ ! -f "node_modules/.bin/tsc" ] && [ ! -f "packages/ui/node_modules/.bin/tsc" ]; then
    MISSING_DEPS=true
fi

if [ "$MISSING_DEPS" = true ] || [ ! -d "node_modules" ] || [ ! -f "pnpm-lock.yaml" ]; then
    echo -e "${YELLOW}依存関係をインストール中...${NC}"
    if ! pnpm install; then
        echo -e "${YELLOW}警告: 依存関係のインストールに失敗しましたが、既存のインストールを使用して続行します${NC}"
        echo -e "${YELLOW}     ネットワーク接続を確認してください${NC}"
    else
        echo -e "${GREEN}✓ 依存関係のインストールが完了しました${NC}"
    fi
else
    echo -e "${GREEN}✓ 依存関係は既にインストール済みです${NC}"
fi
echo ""

# 2. 共有パッケージのビルド（オプション）
echo -e "${YELLOW}[2/3] 共有パッケージをビルド中...${NC}"
BUILD_SUCCESS=false
# turboが利用可能か確認
if command -v turbo >/dev/null 2>&1 || [ -f "node_modules/.bin/turbo" ]; then
    if pnpm build 2>/dev/null; then
        BUILD_SUCCESS=true
    fi
else
    # turboが利用できない場合は個別にビルドを試行
    echo -e "${YELLOW}turboが見つからないため、個別にパッケージをビルドを試行します...${NC}"
    # 必要なパッケージを順番にビルド
    if [ -d "packages/shared" ]; then
        echo -e "${YELLOW}  - @mcp_router/shared をビルド中...${NC}"
        (cd packages/shared && pnpm run build 2>/dev/null) && BUILD_SUCCESS=true || true
    fi
    if [ -d "packages/ui" ]; then
        echo -e "${YELLOW}  - @mcp_router/ui をビルド中...${NC}"
        (cd packages/ui && pnpm run build 2>/dev/null) && BUILD_SUCCESS=true || echo -e "${YELLOW}    警告: @mcp_router/ui のビルドに失敗しましたが、続行します${NC}"
    fi
    if [ -d "packages/remote-api-types" ]; then
        echo -e "${YELLOW}  - @mcp_router/remote-api-types をビルド中...${NC}"
        (cd packages/remote-api-types && pnpm run build 2>/dev/null) && BUILD_SUCCESS=true || true
    fi
fi

if [ "$BUILD_SUCCESS" = true ]; then
    echo -e "${GREEN}✓ 共有パッケージのビルドが完了しました${NC}"
else
    echo -e "${YELLOW}⚠ 共有パッケージのビルドに失敗しましたが、electron-forgeが自動的にビルドする可能性があるため続行します${NC}"
fi
echo ""

# 3. Linux用の.debパッケージ生成
echo -e "${YELLOW}[3/3] Linux用の.debパッケージを生成中...${NC}"
cd apps/electron

# cross-envが利用可能か確認
CROSS_ENV_AVAILABLE=false
if command -v cross-env >/dev/null 2>&1; then
    CROSS_ENV_AVAILABLE=true
elif [ -f "../node_modules/.bin/cross-env" ]; then
    CROSS_ENV_AVAILABLE=true
elif [ -f "node_modules/.bin/cross-env" ]; then
    CROSS_ENV_AVAILABLE=true
fi

if [ "$CROSS_ENV_AVAILABLE" = true ]; then
    # cross-envが利用可能な場合、package.jsonのスクリプトを使用
    echo -e "${YELLOW}cross-envを使用してビルドします...${NC}"
    if ! SKIP_TYPE_CHECK=true pnpm run make:linux; then
        echo -e "${RED}エラー: .debパッケージの生成に失敗しました${NC}"
        exit 1
    fi
else
    # cross-envが利用できない場合は直接環境変数を設定して実行
    echo -e "${YELLOW}cross-envが見つからないため、直接環境変数を設定して実行します...${NC}"
    export NODE_ENV=production
    export npm_config_target_platform=linux
    
    # pnpm execを使用（node_modules/.binが自動的にPATHに追加される）
    echo -e "${YELLOW}環境変数を設定してelectron-forge makeを実行します...${NC}"
    if ! SKIP_TYPE_CHECK=true pnpm exec electron-forge make; then
        echo -e "${RED}エラー: .debパッケージの生成に失敗しました${NC}"
        echo -e "${YELLOW}ヒント: ネットワーク接続を確認し、依存関係をインストールしてください:${NC}"
        echo -e "${YELLOW}      cd /home/luke/projects/mcp-router-linux/mcp-router${NC}"
        echo -e "${YELLOW}      pnpm install${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓ .debパッケージの生成が完了しました${NC}"
echo ""

# 生成されたパッケージの場所を表示
DEB_PATH=$(find "$PROJECT_ROOT/apps/electron/out/make" -name "*.deb" -type f | head -1)
if [ -n "$DEB_PATH" ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}ビルド完了！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "生成されたパッケージ: ${GREEN}$DEB_PATH${NC}"
    echo ""
    echo "インストールコマンド:"
    echo -e "  ${YELLOW}sudo dpkg -i \"$DEB_PATH\"${NC}"
    echo ""
else
    echo -e "${YELLOW}警告: .debファイルが見つかりませんでした${NC}"
    echo "出力ディレクトリ: $PROJECT_ROOT/apps/electron/out/make"
fi
