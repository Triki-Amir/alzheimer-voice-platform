# test_api.py
import requests

url = "http://localhost:3000/api/denoise"
files = {
    'audio': open('public/recordings/PAT_000124_naming_2026-07-30T22-31-02-691Z.webm', 'rb')
}
data = {
    'patientId': 'PAT_000124',
    'testType': 'naming'
}

response = requests.post(url, files=files, data=data)
print(f"Status: {response.status_code}")
print(f"Résultat: {response.json()}")