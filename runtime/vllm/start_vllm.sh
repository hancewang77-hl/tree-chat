#!/usr/bin/env bash
set -euo pipefail

VENV_PATH="${TREECHAT_VLLM_VENV:-$HOME/.venvs/treechat-vllm}"
MODEL="${TREECHAT_VLLM_SOURCE_MODEL:-Qwen/Qwen2.5-0.5B-Instruct}"
SERVED_MODEL="${TREECHAT_VLLM_MODEL:-treechat-qwen2.5-0.5b}"
HOST="${TREECHAT_VLLM_HOST:-127.0.0.1}"
PORT="${TREECHAT_VLLM_PORT:-8001}"
# vLLM 0.26 selects its UVA-backed V2 runner for Qwen2 by default. CUDA UVA
# buffers are unavailable under the checked WSL2 GPU passthrough, while the
# mature V1 runner remains supported and keeps APC enabled.
export VLLM_USE_V2_MODEL_RUNNER="${VLLM_USE_V2_MODEL_RUNNER:-0}"
# The WSL GPU runtime exposes CUDA to PyTorch but does not include nvcc. vLLM's
# optional FlashInfer sampler tries to JIT-compile with nvcc during startup;
# select vLLM's native sampler so a full CUDA Toolkit is not required.
export VLLM_USE_FLASHINFER_SAMPLER="${VLLM_USE_FLASHINFER_SAMPLER:-0}"

if [[ ! -x "$VENV_PATH/bin/vllm" ]]; then
  echo "vLLM is not installed at $VENV_PATH" >&2
  echo "Run: $HOME/.local/bin/uv pip install --python $VENV_PATH/bin/python vllm --torch-backend=auto" >&2
  exit 1
fi

echo "TreeChat vLLM configuration"
echo "  executable: $VENV_PATH/bin/vllm"
echo "  source model: $MODEL"
echo "  served model: $SERVED_MODEL"
echo "  endpoint: http://$HOST:$PORT/v1"
echo "  APC: enabled"
echo "  prefix hash: sha256"
echo "  V2 model runner: $VLLM_USE_V2_MODEL_RUNNER (0 = WSL-compatible V1 runner)"
echo "  FlashInfer sampler: $VLLM_USE_FLASHINFER_SAMPLER (0 = no nvcc dependency)"

exec "$VENV_PATH/bin/vllm" serve "$MODEL" \
  --served-model-name "$SERVED_MODEL" \
  --host "$HOST" \
  --port "$PORT" \
  --dtype half \
  --max-model-len 4096 \
  --gpu-memory-utilization 0.72 \
  --max-num-seqs 4 \
  --enable-prefix-caching \
  --prefix-caching-hash-algo sha256 \
  --generation-config vllm \
  --enable-tokenizer-info-endpoint
