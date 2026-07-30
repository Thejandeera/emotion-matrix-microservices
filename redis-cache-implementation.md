# Refactoring Sentiment Pipeline to Redis Sliding Window (Max 4 Messages)

Refactor the emotion analysis pipeline so that each incoming message is processed without phrase segment splitting. A Redis sliding window (max 4 messages) accumulates sentences across chat turns. The current message undergoes keyword detection, while the combined sliding window text (1-4 messages) is passed to the RoBERTa sentiment service. The result is returned to the frontend, which calculates scores and persists state in sessionStorage. Detailed logs will be added across all backend microservices.

## Architecture & Flow Overview

![Architecture Sequence Diagram](./resources/sequence-diagram.png)

---

## Detailed Requirements Matrix

| Step / Msg # | Redis Storage State | Keyword Detection Input | Sentiment Analysis Input (RoBERTa) | Returned Result & Action |
| :--- | :--- | :--- | :--- | :--- |
| **1st Msg** | `["msg1"]` | `msg1` | `"msg1"` | Return msg1 kw + sentiment score of `"msg1"`. Save to `sessionStorage`. |
| **2nd Msg** | `["msg1", "msg2"]` | `msg2` | `"msg1 msg2"` | Return msg2 kw + sentiment score of `"msg1 msg2"`. Update `sessionStorage`. |
| **3rd Msg** | `["msg1", "msg2", "msg3"]` | `msg3` | `"msg1 msg2 msg3"` | Return msg3 kw + sentiment score of `"msg1 msg2 msg3"`. Update `sessionStorage`. |
| **4th Msg** | `["msg1", "msg2", "msg3", "msg4"]` | `msg4` | `"msg1 msg2 msg3 msg4"` | Return msg4 kw + sentiment score of 4 msgs. Update `sessionStorage`. |
| **5th Msg** | `["msg2", "msg3", "msg4", "msg5"]` *(msg1 dropped)* | `msg5` | `"msg2 msg3 msg4 msg5"` | Return msg5 kw + sentiment score of 4 msgs. Update `sessionStorage`. |

---

## Storage Locations & Data Retention

| Location | Identifier / Key | Stored Data & Purpose | Lifetime |
| :--- | :--- | :--- | :--- |
| **Redis List** | `session_window:<session_id>` | Stores raw text of up to **4 active sentences** for context concatenation. | Persisted in Redis until reset |
| **Redis List** | `session_history:<session_id>` | Stores JSON sentiment records of all turns in session for backend score calculation. | Persisted in Redis until reset |
| **Browser Storage** | `sessionStorage` | Key: `chat_history`, `detected_issues`, `overall_score`. Retains session state on page refresh. | Tab session lifetime |

---

## Step-by-Step Execution & Calculations

### 1. Keyword Extraction (`service-phrase`)
- Operates on the **single incoming message** (no sentence splitting).
- Matches against configured keywords via SpaCy `PhraseMatcher`.
- Outputs matched keyword string, individual phrases list, maximum `keyword_weight`, and `keyword_sentiment` (`positive`, `negative`, or `neutral`).

### 2. Redis Sliding Window Management (`api-gateway`)
- Pushes incoming message text: `RPUSH session_window:<session_id> "msg"`
- Checks length: `LLEN session_window:<session_id>`
- If length exceeds 4: `LPOP session_window:<session_id>` (removes oldest message from top).
- Retrieves current window: `LRANGE session_window:<session_id> 0 -1`.
- Concatenates window messages into a single input string for context-aware sentiment analysis.

### 3. Backend Score Calculation (`service-sentiment`)
- Evaluates concatenated text with `SamLowe/roberta-base-go_emotions` model.
- Applies keyword weight modifier (`modifier = (keyword_weight / 100.0) * 0.40`).
- Computes overall sentiment score across session history items:
  ```python
  negative_count = sum(1 for i in all_items if i.get("keyword_sentiment") == "negative" or i.get("sentiment_category") == "negative")
  positive_count = sum(1 for i in all_items if i.get("keyword_sentiment") == "positive" or i.get("sentiment_category") == "positive")

  if negative_count > 0:
      neg_ratio = negative_count / total_count
      score = round(-30 - neg_ratio * 60)
  elif positive_count > 0:
      pos_ratio = positive_count / total_count
      score = round(30 + pos_ratio * 60)
  else:
      score = 0
  ```
- Returns `overall_score` (-100% to +100%) to the API Gateway.

### 4. Frontend UI Rendering (`frontend`)
- **Caller Messages**: Displayed aligned to the **LEFT** side with dark avatar badge.
- **Agent Messages**: Displayed aligned to the **RIGHT** side with orange gradient avatar badge.
- **Gauge & Score Display**: Directly renders backend-computed `overall_score`.
- **Session Reset**: Clicking "Clear Session" calls `/api/v1/reset-session` (flushes Redis keys) and clears `sessionStorage` and UI state.
