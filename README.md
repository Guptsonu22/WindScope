# WindScope | UK Day-Ahead Power Trading Desk Portal

A production-ready, full-stack decision-support system designed for UK Energy Utility Day-Ahead power trading desks. WindScope monitors GB National Grid wind forecast accuracy across all 48 half-hourly Settlement Periods, quantifies forecast error risk and cashout liabilities against Elexon BMRS market data, and simulates thermal generation replacement procurement (CCGT, OCGT, BESS) to eliminate imbalance exposure before auction gate closure.

---

## 🏛 Architecture Overview

```
project-root/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI app with CORS & lifespan hooks
│   │   ├── config.py                # Pydantic Settings, Elexon API & CORS config
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── logging.py           # Trade desk log formatting with ANSI colors
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py            # /health, /forecast, /metrics, /trading endpoints
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── elexon_client.py     # Async HTTP client with Elexon BMRS failover
│   │   │   ├── data_processor.py    # 48 Settlement Periods processor & cache
│   │   │   └── metrics_engine.py    # MAE, MAPE, RMSE & Thermal procurement engine
│   │   └── schemas/
│   │       ├── __init__.py
│   │       └── models.py            # Pydantic v2 domain schemas
│   ├── data/                        # Cache directory for raw & processed JSON/Parquet
│   ├── tests/
│   │   ├── __init__.py
│   │   └── test_api.py              # Pytest suite for endpoints and calculations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   │   ├── Badge.tsx        # Trading desk status badges
│   │   │   │   └── Card.tsx         # Slate glassmorphism card containers
│   │   │   ├── DashboardHeader.tsx  # SP counter, countdown, Elexon status, clock
│   │   │   ├── ForecastVsActualChart.tsx # 48 SP Recharts multi-series area/line
│   │   │   ├── QuantitativeMetricsTable.tsx # 6 KPI cards & dense SP 1-48 table
│   │   │   ├── ThermalProcurementCalculator.tsx # Interactive reserve hedge simulator
│   │   │   └── GateClosureSelector.tsx   # Auction gate closure stages (DA-12, DA-17, etc.)
│   │   ├── types/
│   │   │   └── index.ts             # Domain TypeScript interfaces
│   │   ├── services/
│   │   │   └── api.ts               # Axios client with proxy & health checks
│   │   ├── App.tsx                  # Main trading desk console
│   │   ├── main.tsx                 # React DOM mount point
│   │   └── index.css                # Tailwind directives & high-density scrollbars
│   ├── package.json
│   ├── vite.config.ts               # Vite proxy to backend (:8000)
│   ├── tailwind.config.js           # Trading slate theme & numeric fonts
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## ⚡ Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.11+, FastAPI, Uvicorn, Pandas, NumPy, Pydantic v2, Pydantic Settings, HTTPX, Pytest |
| **Frontend** | React 18+, Vite, TypeScript, Tailwind CSS, Lucide Icons, Recharts, Axios, Clsx |
| **Market Data** | Elexon Insights Solution (BMRS) REST API v1 (`https://data.elexon.co.uk/bmrs/api/v1`) |
| **Containerization** | Docker, Docker Compose, Nginx multi-stage builds |

---

## 🚀 Quick Start (Local Development)

### 1. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run unit tests
pytest tests -v

# Start FastAPI server on port 8000
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at:
- Documentation: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health` and `http://localhost:8000/api/v1/health`

### 2. Frontend Setup

```bash
cd frontend

# Install npm packages
npm install

# Start Vite dev server on port 5173
npm run dev
```

Open `http://localhost:5173` in your browser. All requests to `/api` and `/health` automatically proxy to the FastAPI backend at `http://localhost:8000`.

---

## 🐳 Docker Deployment

To launch the full stack in synchronized Docker containers:

```bash
docker compose up --build
```

- **Frontend Portal**: `http://localhost:5173` (or `http://localhost:3000`)
- **Backend API**: `http://localhost:8000`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

---

## 📊 Core Business & Market Concepts

1. **UK Settlement Periods (SP 1–48)**:
   The British electricity day is divided into 48 discrete half-hour settlement periods starting from 00:00 to 24:00 (GMT/BST).
2. **Day-Ahead Auction (Gate Closure at 12:00 D-1)**:
   Power utilities must submit balanced generation and physical delivery notifications before exchange matching.
3. **Imbalance Settlement & Cashout Exposure**:
   If actual wind generation falls below the contracted day-ahead forecast, the utility is in a **SHORT** position and must settle the difference at the System Buy Price (SBP), which can spike during peak demand periods.
4. **Thermal Generation Procurement Hedging**:
   Calculates optimal dispatch of Combined Cycle Gas Turbines (CCGT), Open Cycle Gas Turbines (OCGT Peakers), and Battery Energy Storage Systems (BESS) with configurable spinning reserves (0–30%) to mitigate volatility.

---

## 🧪 Testing

```bash
# Backend pytest suite
pytest backend/tests -v

# Frontend TypeScript verification & production build
cd frontend
npm run build
```
