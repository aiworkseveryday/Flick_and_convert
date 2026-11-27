import sys
from onnxruntime.quantization import quantize_dynamic, QuantType
from onnxruntime.quantization.shape_inference import quant_pre_process
src, mid, dst = sys.argv[1:4]
quant_pre_process(src, mid, skip_symbolic_shape=True)
quantize_dynamic(mid, dst, weight_type=QuantType.QUInt8, op_types_to_quantize=['MatMul', 'Gemm'])
