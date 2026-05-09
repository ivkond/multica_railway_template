FROM debian@sha256:f9c6a2fd2ddbc23e336b6257a5245e31f996953ef06cd13a59fa0a1df2d5c252

ARG TARGETARCH
ARG AGENT
ARG MULTICA_VERSION
ARG NODE_VERSION
ARG PNPM_VERSION
ARG INFISICAL_CLI_VERSION
ARG CODEX_VERSION
ARG OPENCODE_VERSION
ARG OPENCODE_SHA256_X64

ENV PATH="/usr/local/lib/nodejs/bin:${PATH}"

RUN set -eux; \
  require_build_arg() { \
    arg_name="$1"; \
    arg_value="$2"; \
    if [ -z "$arg_value" ]; then \
      printf 'Dockerfile: missing required build arg %s\n' "$arg_name" >&2; \
      exit 1; \
    fi; \
  }; \
  case "${TARGETARCH:-amd64}" in \
    amd64) ;; \
    *) \
      printf 'Dockerfile: unsupported TARGETARCH "%s"\n' "${TARGETARCH:-}" >&2; \
      printf 'Dockerfile: daemon image currently supports linux/amd64 only\n' >&2; \
      exit 1; \
      ;; \
  esac; \
  require_build_arg AGENT "${AGENT:-}"; \
  require_build_arg MULTICA_VERSION "${MULTICA_VERSION:-}"; \
  require_build_arg NODE_VERSION "${NODE_VERSION:-}"; \
  require_build_arg PNPM_VERSION "${PNPM_VERSION:-}"; \
  require_build_arg INFISICAL_CLI_VERSION "${INFISICAL_CLI_VERSION:-}"; \
  case "$AGENT" in \
    codex) \
      require_build_arg CODEX_VERSION "${CODEX_VERSION:-}"; \
      ;; \
    opencode) \
      require_build_arg OPENCODE_VERSION "${OPENCODE_VERSION:-}"; \
      require_build_arg OPENCODE_SHA256_X64 "${OPENCODE_SHA256_X64:-}"; \
      ;; \
    *) \
      printf 'Dockerfile: unsupported AGENT "%s"; expected codex or opencode\n' "$AGENT" >&2; \
      exit 1; \
      ;; \
  esac; \
  apt-get update; \
  apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    fzf \
    git \
    jq \
    passwd \
    python3 \
    ripgrep \
    tar \
    unzip \
    xz-utils; \
  rm -rf /var/lib/apt/lists/*; \
  groupadd --system --gid 10001 multica; \
  useradd \
    --system \
    --uid 10001 \
    --gid multica \
    --home-dir /home/multica \
    --create-home \
    --shell /bin/bash \
    multica; \
  install -d -m 700 -o multica -g multica /data; \
  node_url="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"; \
  curl -fsSLo /tmp/node.tar.xz "$node_url"; \
  mkdir -p /usr/local/lib/nodejs; \
  tar -xJf /tmp/node.tar.xz -C /usr/local/lib/nodejs --strip-components=1; \
  rm /tmp/node.tar.xz; \
  for node_binary in node npm npx corepack; do \
    ln -s "/usr/local/lib/nodejs/bin/${node_binary}" "/usr/local/bin/${node_binary}"; \
  done; \
  node --version; \
  npm --version; \
  npx --version; \
  corepack --version; \
  corepack enable; \
  corepack prepare "pnpm@${PNPM_VERSION}" --activate; \
  pnpm --version; \
  npm install -g "@infisical/cli@${INFISICAL_CLI_VERSION}"; \
  infisical --version; \
  multica_asset="multica_linux_amd64.tar.gz"; \
  multica_url="https://github.com/multica-ai/multica/releases/download/${MULTICA_VERSION}/${multica_asset}"; \
  if ! curl -fsSLo /tmp/multica.tar.gz "$multica_url"; then \
    printf 'Dockerfile: failed to download Multica release asset for %s\n' "$MULTICA_VERSION" >&2; \
    exit 1; \
  fi; \
  mkdir -p /tmp/multica; \
  if ! tar -xzf /tmp/multica.tar.gz -C /tmp/multica; then \
    printf 'Dockerfile: failed to extract Multica release asset for %s\n' "$MULTICA_VERSION" >&2; \
    exit 1; \
  fi; \
  multica_path="$(find /tmp/multica -type f -name multica -print -quit)"; \
  if [ -z "$multica_path" ]; then \
    printf 'Dockerfile: Multica asset %s did not contain a binary\n' "$MULTICA_VERSION" >&2; \
    exit 1; \
  fi; \
  install -m 755 "$multica_path" /usr/local/bin/multica; \
  rm -rf /tmp/multica /tmp/multica.tar.gz; \
  multica --version

COPY railway/daemon/scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY railway/daemon/scripts/setup_multica.sh /usr/local/bin/setup_multica.sh
COPY railway/daemon/scripts/setup_agent.sh /usr/local/bin/setup_agent.sh
COPY railway/daemon/scripts/health_proxy.py /usr/local/bin/health_proxy.py

RUN set -eux; \
  chmod 755 \
    /usr/local/bin/entrypoint.sh \
    /usr/local/bin/setup_multica.sh \
    /usr/local/bin/setup_agent.sh \
    /usr/local/bin/health_proxy.py; \
  case "$AGENT" in \
    codex) \
      npm install -g "@openai/codex@${CODEX_VERSION}"; \
      codex --version; \
      ;; \
    opencode) \
      opencode_asset="opencode-linux-x64.tar.gz"; \
      opencode_url="https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/${opencode_asset}"; \
      if ! curl -fsSLo /tmp/opencode.tar.gz "$opencode_url"; then \
        printf 'Dockerfile: failed to download OpenCode release asset for %s\n' "$OPENCODE_VERSION" >&2; \
        exit 1; \
      fi; \
      if ! printf '%s  /tmp/opencode.tar.gz\n' "$OPENCODE_SHA256_X64" | sha256sum -c -; then \
        printf 'Dockerfile: OpenCode checksum mismatch for %s\n' "$OPENCODE_VERSION" >&2; \
        exit 1; \
      fi; \
      mkdir -p /tmp/opencode; \
      if ! tar -xzf /tmp/opencode.tar.gz -C /tmp/opencode; then \
        printf 'Dockerfile: failed to extract OpenCode release asset for %s\n' "$OPENCODE_VERSION" >&2; \
        exit 1; \
      fi; \
      install -m 755 /tmp/opencode/opencode /usr/local/bin/opencode; \
      rm -rf /tmp/opencode /tmp/opencode.tar.gz; \
      opencode --version; \
      ;; \
    *) \
      printf 'Dockerfile: unsupported AGENT "%s"; expected codex or opencode\n' "$AGENT" >&2; \
      exit 1; \
      ;; \
  esac; \
  chown -R multica:multica /data /home/multica

ENV AGENT=$AGENT
ENV MULTICA_VERSION=$MULTICA_VERSION
ENV NODE_VERSION=$NODE_VERSION
ENV PNPM_VERSION=$PNPM_VERSION
ENV INFISICAL_CLI_VERSION=$INFISICAL_CLI_VERSION
ENV CODEX_VERSION=$CODEX_VERSION
ENV OPENCODE_VERSION=$OPENCODE_VERSION

USER multica
WORKDIR /data

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
