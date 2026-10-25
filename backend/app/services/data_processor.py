from datetime import datetime, time, timedelta
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd

from app.config import settings
from app.core.logging import logger
from app.schemas.models import SettlementPeriodData


class DataProcessor:
    """Processes, cleans, aligns, and caches settlement period data for trading desks."""

    def __init__(self, cache_dir: Optional[Path] = None):
        self.cache_dir = cache_dir or settings.DATA_CACHE_DIR
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def calculate_period_times(self, target_date_str: str, settlement_period: int) -> Dict[str, str]:
        """
        Derive start time, end time, and time slot string from UK Settlement Period (1-48).
        Settlement Period 1: 00:00 - 00:30.
        Settlement Period 48: 23:30 - 24:00 (00:00 next day).
        """
        base_date = datetime.strptime(target_date_str, "%Y-%m-%d")
        minutes_start = (settlement_period - 1) * 30
        start_dt = base_date + timedelta(minutes=minutes_start)
        end_dt = start_dt + timedelta(minutes=30)

        start_time_str = start_dt.strftime("%H:%M")
        end_time_str = end_dt.strftime("%H:%M") if end_dt.date() == start_dt.date() else "24:00"

        return {
            "time_slot": f"{start_time_str} - {end_time_str}",
            "start_time": start_dt.isoformat() + "Z",
            "end_time": end_dt.isoformat() + "Z",
        }

    def align_and_process_dataset(
        self,
        target_date: str,
        forecast_raw: List[Dict[str, Any]],
        actual_raw: List[Dict[str, Any]],
        prices_raw: Optional[List[Dict[str, Any]]] = None,
    ) -> List[SettlementPeriodData]:
        """
        Merge raw Elexon records across the 48 Settlement Periods into typed, validated domain models.
        """
        # Map by settlementPeriod
        fc_map = {}
        for r in forecast_raw:
            sp = r.get("settlementPeriod") or r.get("period")
            if sp:
                val = r.get("quantity") or r.get("forecast") or r.get("generation") or 0.0
                fc_map[int(sp)] = float(val)

        act_map = {}
        for r in actual_raw:
            sp = r.get("settlementPeriod") or r.get("period")
            if sp:
                val = r.get("quantity") or r.get("actual") or r.get("generation") or 0.0
                act_map[int(sp)] = float(val)

        price_map = {}
        if prices_raw:
            for r in prices_raw:
                sp = r.get("settlementPeriod") or r.get("period")
                if sp:
                    bp = r.get("systemBuyPrice") or r.get("price") or 75.0
                    price_map[int(sp)] = float(bp)

        processed_periods: List[SettlementPeriodData] = []

        for sp in range(1, 49):
            times = self.calculate_period_times(target_date, sp)
            fc_mw = round(fc_map.get(sp, 8500.0), 1)
            act_mw = round(act_map.get(sp, fc_mw), 1) if sp in act_map else None

            error_mw = None
            error_pct = None
            imbalance = "BALANCED"
            cashout_exposure = None
            price_gbp = price_map.get(sp, 75.0)

            if act_mw is not None:
                error_mw = round(act_mw - fc_mw, 1)
                error_pct = round((error_mw / fc_mw) * 100.0, 2) if fc_mw != 0 else 0.0

                # If actual is noticeably lower than forecast, desk is SHORT (contracted wind that failed to manifest)
                if error_mw < -50.0:
                    imbalance = "SHORT"
                    short_mwh = abs(error_mw) * 0.5  # 30-minute period
                    cashout_exposure = round(short_mwh * price_gbp, 2)
                elif error_mw > 50.0:
                    imbalance = "LONG"
                    long_mwh = error_mw * 0.5
                    cashout_exposure = round(long_mwh * (price_gbp * 0.85), 2)
                else:
                    imbalance = "BALANCED"
                    cashout_exposure = 0.0

            item = SettlementPeriodData(
                settlement_period=sp,
                time_slot=times["time_slot"],
                start_time=times["start_time"],
                end_time=times["end_time"],
                forecast_mw=fc_mw,
                actual_mw=act_mw,
                error_mw=error_mw,
                error_pct=error_pct,
                imbalance_direction=imbalance,
                system_price_gbp_mwh=price_gbp,
                cashout_exposure_gbp=cashout_exposure,
            )
            processed_periods.append(item)

        # Cache processed data to JSON
        self.save_cache(target_date, processed_periods)

        return processed_periods

    def save_cache(self, target_date: str, periods: List[SettlementPeriodData]) -> None:
        """Persist processed dataset to local cache directory for lightning-fast retrieval."""
        try:
            cache_file = self.cache_dir / f"day_ahead_{target_date}.json"
            data = [p.model_dump() for p in periods]
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            logger.debug(f"Cached settlement period data to {cache_file}")
        except Exception as err:
            logger.warning(f"Failed to write cache for {target_date}: {err}")

    def load_cache(self, target_date: str) -> Optional[List[SettlementPeriodData]]:
        """Load processed dataset from cache if present."""
        cache_file = self.cache_dir / f"day_ahead_{target_date}.json"
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                return [SettlementPeriodData(**item) for item in data]
            except Exception as err:
                logger.warning(f"Failed to read cache {cache_file}: {err}")
        return None


_processor_instance: Optional[DataProcessor] = None


def get_data_processor() -> DataProcessor:
    """Singleton provider for DataProcessor."""
    global _processor_instance
    if _processor_instance is None:
        _processor_instance = DataProcessor()
    return _processor_instance
