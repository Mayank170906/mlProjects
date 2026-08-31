from pathlib import Path
import pandas as pd
import onnxruntime as ort
import numpy as np

base = Path(__file__).parent

df_train = pd.read_csv(base / "cdata" / "c_train.csv")
X = df_train.drop(columns=["Transported"])

session = ort.InferenceSession(
    str(base / "models" / "final_model.onnx")
)

input_name = session.get_inputs()[0].name

found = 0

for i, row in X.iloc[:100].iterrows():

    probabilities = []

    for vip_true, vip_unknown in [(0, 0), (1, 0), (0, 1)]:

        test_row = row.to_numpy(dtype=np.float32).copy()

        test_row[-2] = vip_true
        test_row[-1] = vip_unknown

        output = session.run(
            None,
            {input_name: test_row.reshape(1, -1)}
        )

        probabilities.append(output[1][0][1])

    vip_false, vip_true, vip_unknown = probabilities

    if not (
        np.isclose(vip_false, vip_true) and
        np.isclose(vip_false, vip_unknown)
    ):
        found += 1

# print(f"VIP affected {found} out of 100 passengers")

test_cases = [
    [26, 0, 500, 100, 0, 50, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [26, 0, 500, 100, 0, 50, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0],
    [26, 0, 500, 100, 0, 50, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
]

for i, values in enumerate(test_cases, 1):
    x = np.array([values], dtype=np.float32)
    output = session.run(None, {input_name: x})
    p = output[1][0]

    print(f"{i}: {p[0]:.10f}, {p[1]:.10f}")