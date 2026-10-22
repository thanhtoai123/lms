#!/usr/bin/env bash
# Sinh các khoá bí mật ngẫu nhiên và điền vào .env (chỉ điền ô đang trống).
# Chạy MỘT lần sau khi cp .env.prod.example .env. Chạy lại không ghi đè khoá đã có.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Chưa có .env — chạy: cp .env.prod.example .env"; exit 1; }

rand() { openssl rand -base64 48 | tr -d '\n/+=' | cut -c1-48; }

set_if_empty() {
  local key="$1" val="$2"
  if grep -qE "^${key}=$" .env; then
    # Thay đúng dòng trống KEY=
    local esc=${val//\//\\/}
    sed -i "s/^${key}=\$/${key}=${esc}/" .env
    echo "  • ${key} đã sinh"
  fi
}

echo "Sinh khoá bí mật vào .env:"
set_if_empty POSTGRES_PASSWORD "$(rand)"
set_if_empty MEDIA_SIGNING_SECRET "$(rand)"
set_if_empty OTP_PEPPER "$(rand)"
set_if_empty CRON_SECRET "$(rand)"
set_if_empty PII_ENCRYPTION_KEY "$(rand)"

# Cặp VAPID cho thông báo đẩy (nếu có openssl EC)
if grep -qE "^VAPID_PUBLIC_KEY=$" .env; then
  if command -v node >/dev/null 2>&1; then
    read -r PUB PRIV < <(node -e '
      const c=require("crypto");
      const {publicKey,privateKey}=c.generateKeyPairSync("ec",{namedCurve:"prime256v1"});
      const pub=publicKey.export({type:"spki",format:"der"}).subarray(-65);
      const priv=privateKey.export({type:"pkcs8",format:"der"}).subarray(36,36+32);
      const b64u=b=>Buffer.from(b).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
      console.log(b64u(pub)+" "+b64u(priv));
    ' 2>/dev/null) || true
    if [ -n "${PUB:-}" ]; then
      sed -i "s|^VAPID_PUBLIC_KEY=\$|VAPID_PUBLIC_KEY=${PUB}|" .env
      sed -i "s|^VAPID_PRIVATE_KEY=\$|VAPID_PRIVATE_KEY=${PRIV}|" .env
      echo "  • VAPID (thông báo đẩy) đã sinh"
    fi
  fi
fi

echo "Xong. Mở .env điền tiếp các mục còn trống (Supabase, SePay, Zalo…)."
