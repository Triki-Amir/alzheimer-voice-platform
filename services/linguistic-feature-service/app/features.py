# features.py
import json
import logging
import os
from enum import Enum
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from openai import AsyncOpenAI

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Expert en linguistique arabe tunisien/français pour l'analyse de parole pathologique.

RÔLE : Étiqueter chaque mot d'une transcription ASR (dialecte tunisien + code-switching français) avec son tag POS, dans l'ordre exact du texte.

RÈGLES STRICTES :
1. Le texte est déjà segmenté par espaces. Retourne UN tag POS par mot, dans le MÊME ORDRE que le texte original.
2. Le nombre de tags dans "pos_sequence" DOIT être EXACTEMENT égal au nombre de mots dans le texte (séparés par espaces).
3. N'ajoute AUCUN commentaire, AUCUNE explication. Seulement la séquence de tags.

TAXONOMIE POS (une seule valeur par mot) : NOM, VERBE, PRONOM, ADJ, ADV, PART, FILLER (يعني, هكا, اهوه, euh...), CODE_SWITCH."""

# Pydantic schema for vLLM guided JSON output
class POSTag(str, Enum):
    NOM = "NOM"
    VERBE = "VERBE"
    PRONOM = "PRONOM"
    ADJ = "ADJ"
    ADV = "ADV"
    PART = "PART"
    FILLER = "FILLER"
    CODE_SWITCH = "CODE_SWITCH"

class LinguisticAnalysis(BaseModel):
    pos_sequence: List[POSTag] = Field(
        description="Un tag POS par mot du texte original, dans le même ordre, un par mot séparé par espace."
    )


class LinguisticFeatureExtractor:
    def __init__(
        self, 
        vllm_base_url: Optional[str] = None, 
        model_name: Optional[str] = None
    ):
        # Fallback to .env values if parameters are not explicitly passed
        self.vllm_base_url = vllm_base_url or os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1")
        self.model_name = model_name or os.getenv("MODEL_NAME", "Qwen/Qwen2.5-32B-Instruct-AWQ")
        
        self.client = AsyncOpenAI(base_url=self.vllm_base_url, api_key="EMPTY")

    async def extract_linguistic_features(self, raw_text: str) -> Dict[str, Any]:
        """
        Extracts a POS tag per word from raw ASR transcripts using vLLM.
        Does NOT ask the model to repeat words back, since we already have
        the original text — this keeps output size small enough to fit
        comfortably within max_model_len even for long transcripts.
        """
        words = raw_text.split()

        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Texte ({len(words)} mots): {raw_text}"}
                ],
                temperature=0.1,
                max_tokens=1024,
                extra_body={
                    "guided_json": LinguisticAnalysis.model_json_schema()
                }
            )

            choice = response.choices[0]

            if choice.finish_reason == "length":
                logger.error(f"Truncated output for text with {len(words)} words")
                return {
                    "texte_original": raw_text,
                    "tokens_pos": [],
                    "error": "Response truncated - max_tokens too low"
                }

            content = choice.message.content
            parsed = json.loads(content)
            pos_sequence = parsed.get("pos_sequence", [])

            aligned = len(pos_sequence) == len(words)
            if not aligned:
                logger.warning(
                    f"POS sequence length mismatch: {len(pos_sequence)} tags "
                    f"for {len(words)} words"
                )

            tokens_pos = [
                {"mot": w, "pos": p}
                for w, p in zip(words, pos_sequence)
            ]

            return {
                "texte_original": raw_text,
                "tokens_pos": tokens_pos,
                "aligned": aligned
            }

        except Exception as e:
            logger.error(f"Error during linguistic extraction: {str(e)}")
            return {
                "texte_original": raw_text,
                "tokens_pos": [],
                "error": str(e)
            }