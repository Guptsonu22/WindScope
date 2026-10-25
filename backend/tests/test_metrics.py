import math
import numpy as np
import pandas as pd
import pytest

from app.services.metrics_engine import (
    MetricsEngine,
    calculate_mae,
    calculate_rmse,
    calculate_mape,
    calculate_wmape,
    calculate_mbe,
    calculate_pearson_correlation,
    calculate_r2_score,
    calculate_error_percentiles,
)


@pytest.fixture
def engine():
    return MetricsEngine()


# =============================================================================
# 1. GROUND TRUTH NUMPY BENCHMARK TESTS
# =============================================================================

def test_ground_truth_statistical_metrics():
    """
    Test exact analytical calculations against known ground-truth NumPy arrays.
    """
    forecast = np.array([100.0, 200.0, 300.0, 400.0])
    actual = np.array([120.0, 190.0, 280.0, 450.0])

    # Deltas (Forecast - Actual): [-20.0, +10.0, +20.0, -50.0]
    # Absolute errors: [20.0, 10.0, 20.0, 50.0]

    # 1. MAE = (20 + 10 + 20 + 50) / 4 = 100 / 4 = 25.0
    mae = calculate_mae(forecast, actual)
    assert mae == 25.0

    # 2. RMSE = sqrt((400 + 100 + 400 + 2500) / 4) = sqrt(3400 / 4) = sqrt(850) = 29.154759...
    expected_rmse = math.sqrt(850.0)
    rmse = calculate_rmse(forecast, actual)
    assert pytest.approx(rmse, rel=1e-5) == expected_rmse

    # 3. MBE (Mean Bias Error) = (-20 + 10 + 20 - 50) / 4 = -40 / 4 = -10.0
    mbe = calculate_mbe(forecast, actual)
    assert mbe == -10.0

    # 4. wMAPE = sum(|F - A|) / sum(A) * 100 = 100 / (120 + 190 + 280 + 450) * 100 = 100 / 1040 * 100
    expected_wmape = (100.0 / 1040.0) * 100.0  # 9.61538%
    wmape = calculate_wmape(forecast, actual)
    assert pytest.approx(wmape, rel=1e-5) == expected_wmape

    # 5. MAPE = (20/120 + 10/190 + 20/280 + 50/450) / 4 * 100
    expected_mape = np.mean(np.abs(forecast - actual) / actual) * 100.0
    mape = calculate_mape(forecast, actual)
    assert pytest.approx(mape, rel=1e-5) == expected_mape

    # 6. Pearson Correlation
    expected_pearson = np.corrcoef(forecast, actual)[0, 1]
    pearson = calculate_pearson_correlation(forecast, actual)
    assert pytest.approx(pearson, rel=1e-5) == expected_pearson
    assert pearson > 0.95  # Strong positive correlation

    # 7. R² Score: 1 - SS_res / SS_tot
    ss_res = np.sum((actual - forecast) ** 2)
    ss_tot = np.sum((actual - np.mean(actual)) ** 2)
    expected_r2 = 1.0 - (ss_res / ss_tot)
    r2 = calculate_r2_score(forecast, actual)
    assert pytest.approx(r2, rel=1e-5) == expected_r2


def test_error_percentiles():
    """Verify signed and absolute error percentiles against NumPy."""
    forecast = np.array([10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0])
    actual = np.array([8.0, 25.0, 28.0, 45.0, 48.0, 62.0, 65.0, 85.0, 88.0, 105.0])

    errors = forecast - actual
    pcts = calculate_error_percentiles(forecast, actual, percentiles=(10, 50, 90, 95))

    assert pytest.approx(pcts["P10"], 1e-4) == np.percentile(errors, 10)
    assert pytest.approx(pcts["P50"], 1e-4) == np.percentile(errors, 50)
    assert pytest.approx(pcts["P90"], 1e-4) == np.percentile(errors, 90)
    assert pytest.approx(pcts["P95"], 1e-4) == np.percentile(errors, 95)
    assert pcts["P90_abs"] == np.percentile(np.abs(errors), 90)


def test_edge_cases_and_zero_division_guard():
    """Verify zero inputs and division edge cases are handled safely."""
    f_perfect = np.array([1000.0, 2000.0, 3000.0])
    a_perfect = np.array([1000.0, 2000.0, 3000.0])

    assert calculate_mae(f_perfect, a_perfect) == 0.0
    assert calculate_rmse(f_perfect, a_perfect) == 0.0
    assert calculate_mbe(f_perfect, a_perfect) == 0.0
    assert calculate_mape(f_perfect, a_perfect) == 0.0
    assert calculate_wmape(f_perfect, a_perfect) == 0.0
    assert calculate_r2_score(f_perfect, a_perfect) == 1.0

    # Constant arrays (variance = 0)
    f_const = np.array([500.0, 500.0, 500.0])
    a_const = np.array([500.0, 500.0, 500.0])
    assert calculate_pearson_correlation(f_const, a_const) == 0.0

    # Zero actuals
    f_zero = np.array([100.0, 200.0])
    a_zero = np.array([0.0, 0.0])
    assert calculate_wmape(f_zero, a_zero) == 0.0
    assert calculate_mape(f_zero, a_zero) == 0.0


# =============================================================================
# 2. PROCUREMENT RISK & DECISION-SUPPORT TESTS
# =============================================================================

def test_thermal_gap_calculation(engine):
    """
    Test utility Thermal Gap decision metrics:
    - Thermal_expected = max(0, Demand(t) - Forecast(t))
    - Thermal_conservative = max(0, Demand(t) - (Forecast(t) - P90_Buffer))
    - Imbalance Exposure = Thermal_conservative - Thermal_expected
    """
    demand = np.array([30000.0, 35000.0, 40000.0])
    forecast = np.array([10000.0, 12000.0, 8000.0])
    actual = np.array([9000.0, 11500.0, 7000.0])
    p90_buffer = 1500.0

    analysis = engine.calculate_thermal_gap(
        forecast_mw=forecast,
        actual_mw=actual,
        demand_profile_mw=demand,
        p90_buffer_mw=p90_buffer,
        target_date="2026-01-15",
    )

    assert analysis.target_date == "2026-01-15"
    assert analysis.p90_buffer_mw == 1500.0
    assert len(analysis.periods) == 3

    # Period 0: Demand=30000, Forecast=10000
    # Expected thermal = 30000 - 10000 = 20000 MW
    # Conservative thermal = 30000 - (10000 - 1500) = 21500 MW
    # Exposure = 21500 - 20000 = 1500 MW
    p0 = analysis.periods[0]
    assert p0.thermal_expected_mw == 20000.0
    assert p0.thermal_conservative_mw == 21500.0
    assert p0.imbalance_exposure_mw == 1500.0

    # Period 2: Demand=40000, Forecast=8000
    # Expected thermal = 40000 - 8000 = 32000 MW
    # Conservative thermal = 40000 - (8000 - 1500) = 33500 MW
    p2 = analysis.periods[2]
    assert p2.thermal_expected_mw == 32000.0
    assert p2.thermal_conservative_mw == 33500.0
    assert p2.imbalance_exposure_mw == 1500.0

    # Energy in MWh (each 30 min = 0.5 h):
    # Total Expected = (20000 + 23000 + 32000) * 0.5 = 75000 * 0.5 = 37500.0 MWh
    assert analysis.total_thermal_expected_mwh == 37500.0
    # Total Conservative = (21500 + 24500 + 33500) * 0.5 = 79500 * 0.5 = 39750.0 MWh
    assert analysis.total_thermal_conservative_mwh == 39750.0
    assert analysis.total_safety_margin_mwh == 2250.0


def test_settlement_period_breakdown(engine):
    """
    Test settlement period breakdown across SP 1 to 48.
    Verifies that all 48 profiles are computed and peak evening hours are flagged as HIGH_VOLATILITY.
    """
    records = []
    # Create 3 days of aligned records (3 * 48 = 144)
    for day in range(1, 4):
        for sp in range(1, 49):
            start_iso = f"2026-01-0{day}T{(sp-1)*30//60:02d}:{(sp-1)*30%60:02d}:00Z"
            fc = 10000.0 + (500.0 if 32 <= sp <= 40 else 100.0)
            act = 10000.0
            err = fc - act

            records.append({
                "startTime": start_iso,
                "settlementPeriod": sp,
                "publishTime": f"2026-01-0{day-1}T10:30:00Z",
                "forecastGenerationMW": fc,
                "actualGenerationMW": act,
                "forecastErrorMW": err,
                "absoluteErrorMW": abs(err),
                "percentageError": (abs(err) / act) * 100.0,
            })

    df = pd.DataFrame(records)
    breakdown = engine.calculate_settlement_period_breakdown(df)

    assert len(breakdown) == 48
    sp_numbers = [b.settlement_period for b in breakdown]
    assert sp_numbers == list(range(1, 49))

    # Evening peak (SP 35: 17:00-17:30) must be categorized as HIGH_VOLATILITY
    sp35 = next(b for b in breakdown if b.settlement_period == 35)
    assert sp35.uncertainty_tier == "HIGH_VOLATILITY"
    assert sp35.mae_mw == 500.0

    # Night period (SP 6: 02:30-03:00) should be STABLE
    sp6 = next(b for b in breakdown if b.settlement_period == 6)
    assert sp6.uncertainty_tier == "STABLE"
    assert sp6.mae_mw == 100.0


def test_forecast_horizon_decay(engine):
    """
    Test that forecast horizon decay demonstrates improved accuracy
    as lead time shortens from Day-Ahead (D-1 11:00) to Intraday H-4 and H-1.
    """
    from app.services.elexon_client import ElexonClient
    client = ElexonClient()
    actuals, forecasts = client.get_or_create_january_2026_data()

    decay_list = engine.evaluate_forecast_horizon_decay(
        actuals=actuals,
        forecasts=forecasts,
        delivery_date="2026-01-10",
    )

    assert len(decay_list) >= 3
    horizons = [d.horizon for d in decay_list]
    assert any("Day-Ahead" in h for h in horizons)
    assert any("H-4" in h for h in horizons)

    # Intraday H-4 MAE should be lower than Day-Ahead MAE
    da_metric = next(d for d in decay_list if "Day-Ahead" in d.horizon)
    intra_metric = next(d for d in decay_list if "H-4" in d.horizon)

    assert intra_metric.mae_mw < da_metric.mae_mw
    assert intra_metric.mae_reduction_pct_vs_day_ahead > 0.0
