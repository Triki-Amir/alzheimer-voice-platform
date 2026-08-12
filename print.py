conn = get_db_connection()
with conn.cursor() as cur:
    cur.execute(
        "SELECT payload FROM session_features WHERE session_id = %s::uuid AND feature_type = 'linguistic';",
        ("d5e94382-c858-4b3c-b6f7-822d7071a8c1",)
    )
    payload = cur.fetchone()[0]
conn.close()
_print_report(payload)