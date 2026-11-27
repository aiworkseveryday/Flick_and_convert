# Background removal model

Flick uses **BiRefNet lite** (MIT licence, github.com/ZhengPeng7/BiRefNet), with its MatMul weights
quantized to int8. That makes it smaller (224 → 162 MB) and a bit faster on the CPU, with the same cut-out.
The model is too big for git, so build it once:

```bash
curl -L -o birefnet-lite.onnx https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-general-bb_swin_v1_tiny-epoch_232.onnx
python -m venv qenv && qenv/Scripts/python -m pip install onnx onnxruntime
qenv/Scripts/python scripts/quantize-model.py birefnet-lite.onnx pre.onnx models/birefnet-lite-int8.onnx
```

The installer bundles `models/birefnet-lite-int8.onnx`. DirectML (GPU) is not used: it crashed the
integrated Radeon Vega 8 it was tried on.
