# Emotion Matrix - Weighted Sentiment Score Calculation

This document outlines the standard mathematical formula used by the **Emotion Matrix** platform to compute the overall **Weighted Sentiment Score** ($S_{\text{final}}$) displayed in the real-time Live Monitor dashboard ([frontend/src/app/live/page.tsx](file:///c:/Users/Lenovo/Desktop/office/emotion-matrix-microservices/frontend/src/app/live/page.tsx)).

---

## 1. Overview & Objective

The primary objective of the Weighted Sentiment Score is to aggregate individual sentence-level emotion classifications, model confidence scores, and supervisor-defined keyword impact weights into a single, standardized, continuous metric bounded between **$-100\%$** (High Negative) and **$+100\%$** (High Positive).

Unlike simplistic binary counting or hardcoded ratio penalties, this formula dynamically weights each sentence based on:
1. **Directional Sentiment & Confidence** ($s_i \in [-1.0, +1.0]$)
2. **Detected Keyword Impact Weight** ($w_i \ge 1.0$) configured via the Supervisor Dashboard ([frontend/src/app/admin/page.tsx](file:///c:/Users/Lenovo/Desktop/office/emotion-matrix-microservices/frontend/src/app/admin/page.tsx)).

---

## 2. Mathematical Definition

For a text transcript segmented into $N$ analyzed sentences $i \in \{1, 2, \dots, N\}$:

### A. Individual Sentence Directional Score ($s_i$)
Each sentence $i$ has a sentiment classification category ($\text{category}_i$) and a model confidence score ($\text{confidence}_i \in [0.0, 1.0]$):

$$
s_i = 
\begin{cases} 
+\text{confidence}_i, & \text{if } \text{category}_i = \text{"positive"} \\
-\text{confidence}_i, & \text{if } \text{category}_i = \text{"negative"} \\
0.0, & \text{if } \text{category}_i = \text{"neutral"}
\end{cases}
$$

### B. Sentence Importance Weight ($w_i$)
If one or more monitored keyphrases are detected in sentence $i$, the sentence inherits the maximum keyword weight ($K_i \in [0, 100]$) assigned by the supervisor:

$$
w_i = 1.0 + \left( \frac{K_i}{100} \right) \times 0.50
$$

- If no monitored keywords are detected ($K_i = 0$), $w_i = 1.00$.
- If a high-impact keyword is detected (e.g. $K_i = 80$), $w_i = 1.40$ (giving the sentence $40\%$ higher weight in the overall calculation).

### C. Overall Weighted Average Score ($S_{\text{raw}}$)
The overall raw score $S_{\text{raw}} \in [-1.0, +1.0]$ is calculated as the weighted arithmetic mean of all sentence directional scores:

$$
S_{\text{raw}} = \frac{\sum_{i=1}^{N} (s_i \times w_i)}{\sum_{i=1}^{N} w_i}
$$

### D. Normalized Final Sentiment Score ($S_{\text{final}}$)
The raw score is converted to a percentage integer $S_{\text{final}} \in [-100\%, +100\%]$:

$$
S_{\text{final}} = \text{Math.round}(S_{\text{raw}} \times 100)
$$

---

## 3. Step-by-Step Numerical Example

Consider a customer support call transcript with 6 analyzed sentences:

| # | Sentence Segment | Category | Confidence ($\text{conf}_i$) | Keyword ($K_i$) | $s_i$ | $w_i$ | $s_i \times w_i$ |
|---|---|---|---|---|---|---|---|
| 1 | "Hello, this is Michael from ABC Support." | `positive` | 0.1549 (15.5%) | "hello" (77) | $+0.1549$ | $1.385$ | $+0.2145$ |
| 2 | "I just wanted to follow up..." | `positive` | 0.1355 (13.6%) | "good" (7) | $+0.1355$ | $1.035$ | $+0.1402$ |
| 3 | "If there's anything we can assist..." | `positive` | 0.0731 (7.3%) | N/A (0) | $+0.0731$ | $1.000$ | $+0.0731$ |
| 4 | "Should you need a refund..." | `negative` | 0.7560 (75.6%) | "refund" (64) | $-0.7560$ | $1.320$ | $-0.9979$ |
| 5 | "We never refund take your trust..." | `positive` | 0.0629 (6.3%) | "never, refund" (64) | $+0.0629$ | $1.320$ | $+0.0830$ |
| 6 | "Thank you for being our customer." | `positive` | 1.0000 (100%) | "thank you" (89) | $+1.0000$ | $1.445$ | $+1.4450$ |

### Computation:
1. **Total Weight ($\sum w_i$)**:  
   $$1.385 + 1.035 + 1.000 + 1.320 + 1.320 + 1.445 = \mathbf{7.505}$$

2. **Total Weighted Score ($\sum s_i w_i$)**:  
   $$+0.2145 + 0.1402 + 0.0731 - 0.9979 + 0.0830 + 1.4450 = \mathbf{+0.9579}$$

3. **Weighted Mean ($S_{\text{raw}}$)**:  
   $$S_{\text{raw}} = \frac{+0.9579}{7.505} = +0.12763$$

4. **Final Sentiment Score ($S_{\text{final}}$)**:  
   $$S_{\text{final}} = \text{Math.round}(0.12763 \times 100) = \mathbf{+13\%}$$

---

## 4. Gauge Mapping & Display Thresholds

In the Live Monitor UI:
- **$+13\%$ to $+100\%$**: Displayed in emerald green (`HIGH POS` / `POSITIVE`).
- **$-12\%$ to $+12\%$**: Displayed in slate gray (`NEUTRAL`).
- **$-100\%$ to $-13\%$**: Displayed in crimson red (`HIGH NEG` / `NEGATIVE`).

Gauge Pointer position percentage on the track ($P \in [5\%, 95\%]$):
$$
P = \min\left(95, \max\left(5, \frac{S_{\text{final}} + 100}{200} \times 100\right)\right)
$$
