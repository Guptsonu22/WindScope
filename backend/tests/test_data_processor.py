from datetime import datetime, date, time, timedelta, timezone
import os
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from app.services.elexon_client import ElexonClient
from app.services.data_processor import DataProcessor


@pytest.fixture
def processor():
    return DataProcessor()


@pytest.fixture
def elexon_client():
    return ElexonClient()


def test_gate_closure_matching_no_future_leakage(processor):
    """
    VERIFICATION TEST 1:
    Verify that NO forecast published after gate closure (11:00 GMT on D-1) is leaked
    into the day-ahead trading decision dataset.
    """
    delivery_date = "2026-01-15"
    start_time_sp20 = "2026-01-15T09:30:00Z"  # SP 20 on delivery day

    actuals = [
        {
            "dataset": "FUELHH",
            "startTime": start_time_sp20,
            "fuelType": "WIND",
            "generation": 10500.0,
            "settlementDate": delivery_date,
            "settlementPeriod": 20,
        }
    ]

    # Multiple forecast updates published over time for this exact same half-hour:
    forecasts = [
        # 1. D-2 at 12:00 GMT (Eligible, but superseded by later pre-gate forecast)
        {
            "dataset": "WINDFOR",
            "startTime": start_time_sp20,
            "publishTime": "2026-01-13T12:00:00Z",
            "generation": 8000.0,
        },
        # 2. D-1 morning at 06:00 GMT (Eligible, but superseded by 10:30)
        {
            "dataset": "WINDFOR",
            "startTime": start_time_sp20,
            "publishTime": "2026-01-14T06:00:00Z",
            "generation": 9000.0,
        },
        # 3. D-1 pre-gate at 10:30 GMT (THE LATEST PRE-GATE FORECAST: MUST BE CHOSEN!)
        {
            "dataset": "WINDFOR",
            "startTime": start_time_sp20,
            "publishTime": "2026-01-14T10:30:00Z",
            "generation": 10000.0,
        },
        # 4. D-1 post-gate at 14:00 GMT (POST-GATE: MUST BE EXCLUDED FOR 11:00 GATE CLOSURE!)
        {
            "dataset": "WINDFOR",
            "startTime": start_time_sp20,
            "publishTime": "2026-01-14T14:00:00Z",
            "generation": 12000.0,
        },
        # 5. D-1 evening at 18:00 GMT (POST-GATE: MUST BE EXCLUDED!)
        {
            "dataset": "WINDFOR",
            "startTime": start_time_sp20,
            "publishTime": "2026-01-14T18:00:00Z",
            "generation": 13000.0,
        },
        # 6. Intraday on delivery day at 05:30 GMT (INTRADAY: FUTURE LEAKAGE IF INCLUDED!)
        {
            "dataset": "WINDFOR",
            "startTime": start_time_sp20,
            "publishTime": "2026-01-15T05:30:00Z",
            "generation": 14000.0,
        },
    ]

    # Test Standard UK Day-Ahead Gate Closure at 11:00 GMT
    aligned_df = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        delivery_date=delivery_date,
        gate_closure_time="11:00",
    )

    assert not aligned_df.empty, "Aligned DataFrame must not be empty"
    assert len(aligned_df) == 1, "Must contain exactly 1 matched record"

    selected_row = aligned_df.iloc[0]

    # Gate Closure Verification:
    # Selected forecast MUST be the 10:30 GMT update (the latest published <= 11:00 GMT on D-1)
    assert selected_row["publishTime"] == "2026-01-14T10:30:00Z", (
        f"Expected latest pre-gate forecast published at 10:30Z, got {selected_row['publishTime']}"
    )
    assert selected_row["forecastGenerationMW"] == 10000.0, (
        f"Expected 10,000 MW, got {selected_row['forecastGenerationMW']}"
    )

    # Strictly verify zero future leakage:
    cutoff_timestamp = pd.Timestamp("2026-01-14T11:00:00Z")
    actual_publish = pd.Timestamp(selected_row["publishTime"])
    assert actual_publish <= cutoff_timestamp, (
        f"LEAKAGE DETECTED: Forecast publishTime {actual_publish} is after gate closure cutoff {cutoff_timestamp}!"
    )

    # Now verify switching gate closure to 14:00 GMT picks the 14:00 forecast
    aligned_1400 = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        delivery_date=delivery_date,
        gate_closure_time="14:00",
    )
    assert aligned_1400.iloc[0]["publishTime"] == "2026-01-14T14:00:00Z"
    assert aligned_1400.iloc[0]["forecastGenerationMW"] == 12000.0


def test_half_hourly_alignment_accuracy(processor):
    """
    VERIFICATION TEST 2:
    Verify that half-hourly alignment accurately produces sequential 30-minute intervals
    across all 48 settlement periods with correct mathematical error metrics.
    """
    delivery_date = "2026-01-20"
    base_dt = datetime(2026, 1, 20, 0, 0, 0, tzinfo=timezone.utc)

    actuals = []
    forecasts = []

    for sp in range(1, 49):
        period_dt = base_dt + timedelta(minutes=(sp - 1) * 30)
        start_iso = period_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        act_val = 10000.0 + sp * 100.0
        fc_val = act_val + 500.0  # Systemic over-forecast of +500 MW

        actuals.append({
            "startTime": start_iso,
            "fuelType": "WIND",
            "generation": act_val,
            "settlementPeriod": sp,
            "settlementDate": delivery_date,
        })

        # Published on D-1 at 10:45 GMT (Prior to 11:00 Gate Closure)
        forecasts.append({
            "startTime": start_iso,
            "publishTime": "2026-01-19T10:45:00Z",
            "generation": fc_val,
        })

    aligned_df = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        delivery_date=delivery_date,
        gate_closure_time="11:00",
    )

    # 1. Exactly 48 settlement periods
    assert len(aligned_df) == 48, f"Expected 48 settlement periods, got {len(aligned_df)}"

    # 2. Sequential SP numbers 1 to 48
    assert list(aligned_df["settlementPeriod"]) == list(range(1, 49)), (
        "Settlement periods must be sequential integers from 1 to 48"
    )

    # 3. Check exact 30-minute spacing
    dt_series = pd.to_datetime(aligned_df["startTime"], utc=True)
    time_diffs = dt_series.diff().dropna()
    for diff in time_diffs:
        assert diff == timedelta(minutes=30), (
            f"Interval difference must be exactly 30 minutes (1800s), got {diff}"
        )

    # 4. Verify mathematical precision of required error formulas:
    # forecastErrorMW = forecastGenerationMW - actualGenerationMW
    # absoluteErrorMW = |forecastErrorMW|
    # percentageError = (|forecastErrorMW| / actualGenerationMW) * 100
    for _, row in aligned_df.iterrows():
        expected_error = row["forecastGenerationMW"] - row["actualGenerationMW"]
        expected_abs = abs(expected_error)
        expected_pct = round((expected_abs / row["actualGenerationMW"]) * 100.0, 2)

        assert pytest.approx(row["forecastErrorMW"], 0.01) == expected_error
        assert pytest.approx(row["absoluteErrorMW"], 0.01) == expected_abs
        assert pytest.approx(row["percentageError"], 0.01) == expected_pct


def test_january_2026_dataset_and_parquet_cache(elexon_client, processor):
    """
    VERIFICATION TEST 3:
    Verify the January 2026 UK Wind generation dataset generation:
    - 1,488 settlement periods (31 days * 48 SPs).
    - Realistic wind generation bounds: 4,000 MW to 18,000 MW.
    - Parquet caching at backend/data/jan_2026_wind_data.parquet.
    - Month-long gate closure alignment with zero data leakage.
    """
    actuals, forecasts = elexon_client.get_or_create_january_2026_data()

    # Verify Parquet file was written
    assert elexon_client.parquet_path.exists(), "jan_2026_wind_data.parquet must exist"
    assert elexon_client.parquet_path.stat().st_size > 1000, "Parquet file must be non-empty"

    # Verify actuals count (31 days * 48 SPs = 1,488)
    assert len(actuals) == 1488, f"Expected 1,488 half-hours in January 2026, got {len(actuals)}"

    # Verify wind generation scale bounds (4,000 MW to 18,000 MW)
    gen_values = [a["generation"] for a in actuals]
    assert min(gen_values) >= 4000.0, f"Minimum generation was {min(gen_values)} MW, below 4,000 MW"
    assert max(gen_values) <= 18000.0, f"Maximum generation was {max(gen_values)} MW, above 18,000 MW"

    # Run Day-Ahead Gate Closure alignment across the entire month of January 2026
    aligned_month = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        gate_closure_time="11:00",
    )

    assert len(aligned_month) == 1488, (
        f"Aligned month must contain all 1,488 settlement periods, got {len(aligned_month)}"
    )

    # Verify that for EVERY row in January 2026:
    # publishTime <= (delivery_day - 1 day) at 11:00 GMT
    for _, row in aligned_month.iterrows():
        period_dt = pd.Timestamp(row["startTime"])
        delivery_day = period_dt.date()
        cutoff_dt = pd.Timestamp(datetime.combine(delivery_day - timedelta(days=1), time(11, 0), tzinfo=timezone.utc))
        publish_dt = pd.Timestamp(row["publishTime"])

        assert publish_dt <= cutoff_dt, (
            f"Leakage detected on {delivery_day}: publishTime {publish_dt} is after cutoff {cutoff_dt}"
        )


def test_gate_closure_sensitivity_comparison(processor, elexon_client):
    """
    VERIFICATION TEST 4:
    Verify that closer gate closures (e.g., 14:00 vs 09:00) yield improved accuracy metrics.
    """
    actuals, forecasts = elexon_client.get_or_create_january_2026_data()
    comp_df = processor.compare_gate_closure_accuracies(
        actuals=actuals,
        forecasts=forecasts,
        delivery_date="2026-01-10",
        gate_closure_times=["09:00", "11:00", "14:00", "intra-h4"],
    )

    assert len(comp_df) == 4
    assert list(comp_df["gateClosure"]) == ["09:00", "11:00", "14:00", "intra-h4"]

    # Verify that Intraday H-4 forecast has lower MAE than early morning D-1 09:00 forecast
    mae_0900 = comp_df[comp_df["gateClosure"] == "09:00"]["maeMW"].iloc[0]
    mae_intra = comp_df[comp_df["gateClosure"] == "intra-h4"]["maeMW"].iloc[0]
    assert mae_intra <= mae_0900, "Intraday forecast closer to delivery should have lower or equal MAE"
