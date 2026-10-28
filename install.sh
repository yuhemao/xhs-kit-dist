#!/bin/sh
# xhs-kit 安装器（macOS，Apple 芯片 / Intel）。
#   curl -fsSL https://raw.githubusercontent.com/yuhemao/xhs-kit-dist/main/install.sh | sh
#   sh install.sh --uninstall
# 只依赖 macOS 自带命令：curl tar unzip shasum plutil。不使用 sudo。
set -eu

REPO="${XHS_KIT_REPO:-yuhemao/xhs-kit-dist}"
BASE_URL="${XHS_KIT_BASE_URL:-https://github.com/$REPO/releases/latest/download}"
XHS_HOME="${XHS_KIT_HOME:-$HOME/.xhs-kit}"
BIN="$XHS_HOME/bin/xhs-kit"
EXT_BASE="${XHS_KIT_EXT_BASE_URL:-https://github.com/$REPO/releases/download/extension}"
EXT_DIR="$XHS_HOME/extension"
RAW_BASE="https://raw.githubusercontent.com/$REPO/main"

log() { printf '==> %s\n' "$*" >&2; }
warn() { printf '!!  %s\n' "$*" >&2; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ---- 已登记到各助手的配置文件 -------------------------------------------------
WB_FILES="$HOME/.workbuddy/mcp.json $HOME/.workbuddy-ai/mcp.json"
CLAUDE_CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"

claude_running() { pgrep -x "Claude" >/dev/null 2>&1; }

# 往 { "mcpServers": {...} } 形式的 JSON 文件登记 xhs-kit（保留其余内容，改前备份）
json_register() {
  f="$1"; entry="$2"
  mkdir -p "$(dirname "$f")"
  if [ ! -s "$f" ] || [ "$(tr -d ' \n\r\t' < "$f")" = "{}" ]; then
    # plutil 无法往空的根对象里插入，空文件/{} 直接写入完整内容
    [ -f "$f" ] && cp -p "$f" "$f.xhs-kit.bak"
    printf '{"mcpServers":{"xhs-kit":%s}}\n' "$entry" > "$f"
    return 0
  fi
  cp -p "$f" "$f.xhs-kit.bak"
  plutil -extract mcpServers json -o - "$f" >/dev/null 2>&1 || plutil -insert mcpServers -json '{}' "$f"
  if plutil -extract mcpServers.xhs-kit json -o - "$f" >/dev/null 2>&1; then
    plutil -replace mcpServers.xhs-kit -json "$entry" "$f"
  else
    plutil -insert mcpServers.xhs-kit -json "$entry" "$f"
  fi
}

json_unregister() {
  f="$1"
  [ -f "$f" ] || return 0
  plutil -extract mcpServers.xhs-kit json -o - "$f" >/dev/null 2>&1 || return 0
  cp -p "$f" "$f.xhs-kit.bak"
  plutil -remove mcpServers.xhs-kit "$f"
}

# ---- 卸载 ---------------------------------------------------------------------
if [ "${1:-}" = "--uninstall" ]; then
  log "卸载 xhs-kit（保留 $XHS_HOME/settings）"
  for f in $WB_FILES "$CLAUDE_CFG"; do
    if [ "$f" = "$CLAUDE_CFG" ] && claude_running; then
      warn "Claude 正在运行，请先完全退出 Claude 再重新执行 --uninstall，否则配置会被它覆盖。"
      continue
    fi
    json_unregister "$f" && log "已清理 $f"
  done
  command -v codex >/dev/null 2>&1 && codex mcp remove xhs-kit >/dev/null 2>&1 || true
  [ -x "$BIN" ] && "$BIN" daemon stop >/dev/null 2>&1 || true
  rm -f "$BIN"
  rm -rf "$EXT_DIR"
  pkill -f "$XHS_HOME/register-claude.sh" >/dev/null 2>&1 || true
  rm -f "$XHS_HOME/register-claude.sh"
  log "完成。如需彻底删除数据：rm -rf $XHS_HOME"
  exit 0
fi

# ---- 平台判断（Rosetta 下的 shell 也要识别出真实的 Apple 芯片）---------------
[ "$(uname -s)" = "Darwin" ] || die "目前只支持 macOS"
if [ -n "${XHS_KIT_PLATFORM:-}" ]; then
  PLATFORM="$XHS_KIT_PLATFORM"
elif [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
  PLATFORM="darwin-arm64"
else
  PLATFORM="darwin-x64"
fi
log "平台：$PLATFORM"

for c in curl tar unzip shasum plutil; do command -v "$c" >/dev/null 2>&1 || die "缺少系统命令：$c"; done

# ---- 下载并校验引擎 -------------------------------------------------------------
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log "读取最新版本信息"
curl -fsSL --retry 3 "$BASE_URL/version.json" -o "$TMP/version.json" || die "下载 version.json 失败（网络是否能访问 github.com？）"
VERSION="$(plutil -extract version raw -o - "$TMP/version.json")"
URL="$(plutil -extract "assets.$PLATFORM.url" raw -o - "$TMP/version.json" 2>/dev/null)" \
  || die "最新版本 $VERSION 还没有 $PLATFORM 的安装包"
SHA="$(plutil -extract "assets.$PLATFORM.sha256" raw -o - "$TMP/version.json")"
case "$URL" in https://*|file://*) ;; *) die "不安全的下载地址：$URL" ;; esac

log "下载引擎 $VERSION"
curl -fL --retry 3 "$URL" -o "$TMP/engine.tar.gz" || die "下载引擎失败"
[ "$(shasum -a 256 "$TMP/engine.tar.gz" | cut -d' ' -f1)" = "$SHA" ] || die "校验失败（sha256 不符），已中止，未做任何安装"
tar -xzf "$TMP/engine.tar.gz" -C "$TMP" bsk
chmod +x "$TMP/bsk"
# Apple 芯片要求二进制带签名；已带签名则不动
codesign -v "$TMP/bsk" >/dev/null 2>&1 || codesign --force --sign - "$TMP/bsk" >/dev/null 2>&1 || true
"$TMP/bsk" --version >/dev/null 2>&1 || die "下载的引擎无法在这台电脑上运行"

mkdir -p "$XHS_HOME/bin"
[ -x "$BIN" ] && "$BIN" daemon stop >/dev/null 2>&1 || true
mv -f "$TMP/bsk" "$BIN.new" && mv -f "$BIN.new" "$BIN"
log "引擎已安装：$BIN（$("$BIN" --version 2>&1)）"

# ---- 下载浏览器扩展（Chrome 里的加载动作必须由用户完成）-----------------------------
EXT_OK=""
if curl -fsSL --retry 3 "$EXT_BASE/xhs-kit-extension.zip" -o "$TMP/ext.zip" \
   && curl -fsSL --retry 3 "$EXT_BASE/xhs-kit-extension.sha256" -o "$TMP/ext.sha256" \
   && [ "$(shasum -a 256 "$TMP/ext.zip" | cut -d' ' -f1)" = "$(cut -d' ' -f1 "$TMP/ext.sha256")" ]; then
  rm -rf "$EXT_DIR.new" && mkdir -p "$EXT_DIR.new" && unzip -q "$TMP/ext.zip" -d "$EXT_DIR.new" \
    && rm -rf "$EXT_DIR" && mv "$EXT_DIR.new" "$EXT_DIR" && EXT_OK=1 && log "扩展已下载到 $EXT_DIR"
fi
[ -n "$EXT_OK" ] || warn "扩展下载或校验失败，引擎已装好；请稍后重新运行安装脚本。"

# ---- 登记到各 AI 助手 ----------------------------------------------------------
# 条目内容固定不变：以后只替换二进制，避免 WorkBuddy 因配置哈希变化重新要求授信
ENTRY="{\"command\":\"$BIN\",\"args\":[\"mcp\"],\"timeout\":120000,\"disabled\":false}"
FOUND=""
PENDING_CLAUDE=""

for f in $WB_FILES; do
  if [ -d "$(dirname "$f")" ]; then
    if json_register "$f" "$ENTRY"; then log "已登记到 WorkBuddy：$f"; FOUND="$FOUND WorkBuddy"; else warn "无法修改 $f（格式异常？），已跳过，原文件未变（备份在 $f.xhs-kit.bak）"; fi
  fi
done

if [ -d "$HOME/Library/Application Support/Claude" ]; then
  FOUND="$FOUND Claude"
  if claude_running; then
    # Claude 运行中写配置会被它退出时覆盖：交给后台小助手，等 Claude 退出后再写
    PENDING_CLAUDE=1
    HELPER="$XHS_HOME/register-claude.sh"
    cat > "$HELPER" <<EOF
#!/bin/sh
n=0
while pgrep -x "Claude" >/dev/null 2>&1; do n=\$((n+1)); [ \$n -gt 43200 ] && exit 0; sleep 2; done
f="$CLAUDE_CFG"
cp -p "\$f" "\$f.xhs-kit.bak" 2>/dev/null
if [ ! -s "\$f" ] || [ "\$(tr -d ' \\n\\r\\t' < "\$f")" = "{}" ]; then
  printf '{"mcpServers":{"xhs-kit":%s}}\n' '$ENTRY' > "\$f"
  open -a Claude
  exit 0
fi
plutil -extract mcpServers json -o - "\$f" >/dev/null 2>&1 || plutil -insert mcpServers -json '{}' "\$f"
plutil -extract mcpServers.xhs-kit json -o - "\$f" >/dev/null 2>&1 \\
  && plutil -replace mcpServers.xhs-kit -json '$ENTRY' "\$f" \\
  || plutil -insert mcpServers.xhs-kit -json '$ENTRY' "\$f"
open -a Claude
EOF
    chmod +x "$HELPER"
    nohup "$HELPER" >/dev/null 2>&1 &
    warn "Claude 正在运行：配置会在你完全退出 Claude（⌘Q）后自动写入，并自动重新打开 Claude。"
  else
    if json_register "$CLAUDE_CFG" "$ENTRY"; then log "已登记到 Claude：$CLAUDE_CFG"; else warn "无法修改 Claude 配置文件，已跳过"; fi
  fi
fi

if command -v codex >/dev/null 2>&1; then
  codex mcp remove xhs-kit >/dev/null 2>&1 || true
  if codex mcp add xhs-kit -- "$BIN" mcp >/dev/null 2>&1; then
    log "已登记到 Codex"; FOUND="$FOUND Codex"
  else
    warn "Codex 登记失败，可手动执行：codex mcp add xhs-kit -- $BIN mcp"
  fi
fi

[ -n "$FOUND" ] || warn "没有检测到 Claude / WorkBuddy / Codex，引擎已装好，但还没登记到任何助手。"

# 留一份安装脚本，供以后 --uninstall 使用
curl -fsSL --retry 2 "$RAW_BASE/install.sh" -o "$XHS_HOME/install.sh" 2>/dev/null || cp "$0" "$XHS_HOME/install.sh" 2>/dev/null || true

# ---- 使用教程 -------------------------------------------------------------------
curl -fsSL --retry 2 "$RAW_BASE/USAGE.md" -o "$XHS_HOME/USAGE.md" 2>/dev/null || cp "$(dirname "$0")/USAGE.md" "$XHS_HOME/USAGE.md" 2>/dev/null || true

# ---- 自检 + 结果 ----------------------------------------------------------------
echo
echo "================ xhs-kit 安装结果 ================"
echo "引擎版本：$("$BIN" --version 2>&1)（$PLATFORM）"
echo "已登记的助手：${FOUND:-无}"
[ -n "$PENDING_CLAUDE" ] && echo "待完成：请完全退出 Claude（⌘Q）一次，配置会自动写入并重新打开 Claude。"
echo
if [ -n "$EXT_OK" ]; then
  echo "【给 AI 助手】下面这一步只有用户本人能做：请把 5 个步骤和扩展文件夹的完整路径原样、逐条告诉用户，不要省略或概括。"
  echo "唯一需要你手动做的一步：在 Chrome 里加载扩展「鱼猫投放MCP」"
  echo "  1. 打开 chrome://extensions（已为你尝试打开）"
  echo "  2. 打开右上角「开发者模式」"
  echo "  3. 点「加载已解压的扩展程序」"
  echo "  4. 选择这个文件夹：$EXT_DIR"
  echo "     （这是隐藏文件夹：在选择窗口里按 ⌘+Shift+G，粘贴上面的路径，回车后点「选择」）"
  echo "  5. 保持 Chrome 登录蒲公英（pgy.xiaohongshu.com）"
else
  echo "扩展没有下载成功：请重新运行安装脚本。"
fi
echo "=================================================="
echo
[ -n "$EXT_OK" ] && [ -z "${XHS_KIT_NO_OPEN:-}" ] && { open -a "Google Chrome" "chrome://extensions" >/dev/null 2>&1 || true; open "$EXT_DIR" >/dev/null 2>&1 || true; }
[ -f "$XHS_HOME/USAGE.md" ] && cat "$XHS_HOME/USAGE.md"
