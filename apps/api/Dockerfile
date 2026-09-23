# syntax=docker/dockerfile:1

# ---------- 依存の解決 ----------
FROM composer:2 AS vendor

WORKDIR /app
COPY composer.json composer.lock ./
# スクリプトは Symfony の環境変数を要求するのでこの段階では走らせない
RUN composer install \
      --no-dev \
      --no-scripts \
      --no-interaction \
      --prefer-dist \
      --optimize-autoloader

# ---------- 実行イメージ ----------
# alpine 版はイメージが小さくなるが、install-php-extensions が
# 拡張をソースからビルドするためデプロイのたびに10分以上かかる。
# 685MB との差で増えるコストは Artifact Registry の無料枠超過分だけ
# （月2円程度）なので、ビルド時間を優先して Debian ベースを使う。
FROM dunglas/frankenphp:1-php8.3

# pdo_pgsql は Neon への接続に、opcache と apcu は本番の実行速度に必要
RUN install-php-extensions \
      pdo_pgsql \
      intl \
      opcache \
      apcu \
      zip

WORKDIR /app

ENV APP_ENV=prod \
    APP_DEBUG=0 \
    # Cloud Run は $PORT で待ち受けることを要求する。TLS は Cloud Run 側で終端される。
    SERVER_NAME=:8080 \
    FRANKENPHP_CONFIG="worker ./public/index.php"

COPY --from=vendor /app/vendor ./vendor
COPY . .

# 本番向けの opcache 設定
RUN printf '%s\n' \
      'opcache.enable=1' \
      'opcache.memory_consumption=128' \
      'opcache.max_accelerated_files=20000' \
      'opcache.validate_timestamps=0' \
      'opcache.preload=/app/config/preload.php' \
      'opcache.preload_user=root' \
      > "$PHP_INI_DIR/conf.d/opcache.ini"

# キャッシュはイメージに焼き込む。起動を速くし、コールドスタートを短縮する。
# ビルド時は実 DB に繋がないため、ダミーの DATABASE_URL でウォームアップする。
RUN APP_SECRET=build-time-placeholder \
    DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?serverVersion=16" \
    ADMIN_TOKEN=build-time-placeholder \
    php bin/console cache:warmup --env=prod \
 && chmod -R 777 var

EXPOSE 8080
