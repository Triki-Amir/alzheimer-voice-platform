import soundfile as sf

from app.extract import extract_patient_segments


def test_extract_patient_segments_concatenates_only_patient_segments(tmp_path):
    input_path = tmp_path / "input.wav"
    output_path = tmp_path / "output.wav"
    sample_rate = 16000
    samples = [0.0] * sample_rate + [0.5] * sample_rate + [0.0] * sample_rate
    sf.write(input_path, samples, sample_rate)

    segments = [
        {"start": 0.0, "end": 1.0, "role": "doctor"},
        {"start": 1.0, "end": 2.0, "role": "patient"},
        {"start": 2.0, "end": 3.0, "role": "patient"},
    ]

    extracted_path, extracted_segments = extract_patient_segments(str(input_path), segments, str(output_path))

    assert extracted_path == str(output_path)
    assert len(extracted_segments) == 2
    assert output_path.exists()