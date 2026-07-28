from app.metrics import build_pause_metrics


def test_build_pause_metrics_merges_overlaps_and_counts_pauses():
    segments = [
        {"start": 0.0, "end": 1.0},
        {"start": 0.9, "end": 2.0},
        {"start": 4.0, "end": 5.0},
    ]

    metrics = build_pause_metrics(segments, total_duration=6.0)

    assert metrics["speech_duration_seconds"] == 3.0
    assert metrics["pause_count"] == 2
    assert metrics["pause_duration_seconds"] == 3.0