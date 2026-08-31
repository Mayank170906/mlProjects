# ONNX Model Input Guide

## Model

- Model: Tuned LightGBM Classifier
- Format: ONNX
- Model file: `final_model.onnx`
- Expected input columns: **16**
- Input data type: `float32`
- Output: `Transported`
- Classification threshold: `0.42`
- `probability >= 0.42` → `True`
- `probability < 0.42` → `False`

> **Important:** `PassengerId` is NOT used by the model.

## Input Columns

The model expects exactly **16 features in this exact order**:

| # | Column | Type | Values |
|---|---|---|---|
| 1 | `Age` | float | 0–79 |
| 2 | `RoomService` | float | >= 0 |
| 3 | `FoodCourt` | float | >= 0 |
| 4 | `ShoppingMall` | float | >= 0 |
| 5 | `Spa` | float | >= 0 |
| 6 | `VRDeck` | float | >= 0 |
| 7 | `HomePlanet_Europa` | float | 0 or 1 |
| 8 | `HomePlanet_Mars` | float | 0 or 1 |
| 9 | `HomePlanet_Unknown` | float | 0 or 1 |
| 10 | `CryoSleep_True` | float | 0 or 1 |
| 11 | `CryoSleep_Unknown` | float | 0 or 1 |
| 12 | `Destination_PSO J318.5-22` | float | 0 or 1 |
| 13 | `Destination_TRAPPIST-1e` | float | 0 or 1 |
| 14 | `Destination_Unknown` | float | 0 or 1 |
| 15 | `VIP_True` | float | 0 or 1 |
| 16 | `VIP_Unknown` | float | 0 or 1 |

## Preprocessing

The ONNX model expects data **after preprocessing**.

### Numeric Features

The following are numeric:

- `Age`
- `RoomService`
- `FoodCourt`
- `ShoppingMall`
- `Spa`
- `VRDeck`

Missing numeric values were replaced with the median during preprocessing.

### Categorical Features

The following were one-hot encoded:

- `HomePlanet`
- `CryoSleep`
- `Destination`
- `VIP`

Only the resulting `0/1` columns are passed to the model.

For example:

```text
HomePlanet = Europa
```

becomes:

```text
HomePlanet_Europa  = 1
HomePlanet_Mars    = 0
HomePlanet_Unknown = 0
```

If the original value was missing:

```text
HomePlanet_Unknown = 1
```

## Input Requirements

The ONNX input must:

1. Contain exactly **16 values**
2. Use the exact column order listed above
3. Contain numeric values
4. Use `float32`
5. Not contain `PassengerId`
6. Not contain the original categorical strings

## Loading with ONNX Runtime Web

ONNX Runtime Web can be loaded directly from a CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/ort.min.js"></script>
```

Then load the model:

```javascript
const session = await ort.InferenceSession.create(
    "./final_model.onnx"
);
```

The browser downloads the ONNX Runtime JavaScript library automatically.

## Creating the Input

```javascript
const inputData = new Float32Array([
    26.0,
    0.0,
    500.0,
    100.0,
    0.0,
    50.0,

    1.0,
    0.0,
    0.0,

    0.0,
    0.0,

    0.0,
    1.0,
    0.0,

    0.0,
    0.0
]);
```

The values must correspond to the 16 columns in the exact order defined above.

Create the ONNX tensor:

```javascript
const inputTensor = new ort.Tensor(
    "float32",
    inputData,
    [1, 16]
);
```

Run the model:

```javascript
const results = await session.run({
    float_input: inputTensor
});
```

Check the model output names if needed:

```javascript
console.log(session.outputNames);
```

## Final Classification

The model uses a classification threshold of **0.42**.

```javascript
const prediction = probability >= 0.42;
```

Therefore:

```text
Probability >= 0.42 → Transported = True
Probability <  0.42 → Transported = False
```

## Prediction Flow

```text
User input
    ↓
Preprocessing / one-hot encoding
    ↓
16 numeric features
    ↓
Float32Array
    ↓
ONNX Runtime Web
    ↓
final_model.onnx
    ↓
Probability
    ↓
Threshold = 0.42
    ↓
Transported: True / False
```