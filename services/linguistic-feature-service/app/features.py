import json
from typing import Dict, Any
from openai import OpenAI

SYSTEM_PROMPT = """Expert en linguistique arabe tunisien/français pour l'analyse de parole pathologique.

RÔLE : Structurer une transcription ASR bruitée (dialecte tunisien + code-switching français) sans altérer les structures ni supprimer les répétitions/hésitations.

RÈGLES STRICTES :
1. CORRECTION CIBLÉE ASR : Corrige l'orthographe des mots déformés/mal reconnus par l'ASR pour retrouver leur forme/racine exacte (NOM, VERBE, PRONOM, FILLER).
2. CONSERVATION ABSOLUE : Garde TOUTES les répétitions, hésitations, faux démarrages et structures agrammaticales du locuteur. Ne supprime AUCUN mot. Ne rajoute AUCUN mot.
3. PONCTUATION : Restaure uniquement la ponctuation (., ?) dans "texte_ponctue".

TAXONOMIE POS : NOM, VERBE, PRONOM, ADJ, ADV, PART, FILLER (يعني, هكا, اهوه, euh...), CODE_SWITCH.

Réponds STRICTEMENT en JSON valide sans aucun texte autour :
{
  "texte_original": "string",
  "texte_ponctue": "string",
  "tokens_pos": [
    {
      "mot": "mot_asr_original",
      "lemma": "racine_ou_mot_corrige",
      "pos": "TAG_POS",
      "is_repetition": false
    }
  ]
}"""

class LinguisticFeatureExtractor:
    def __init__(self, vllm_base_url: str, model_name: str):
        self.client = OpenAI(base_url=vllm_base_url, api_key="EMPTY")
        self.model_name = model_name

    def extract_linguistic_features(self, raw_text: str) -> Dict[str, Any]:
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Texte brut: {raw_text}"}
            ],
            temperature=0.1,
            response_format={"type": "json_object"}
        )

        content = response.choices[0].message.content
        return json.loads(content)