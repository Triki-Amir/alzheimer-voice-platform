# punctuation.py
"""
ÉTAPE 1 : Détection des frontières de phrases + insertion de ponctuation.

Principe clé : on ne demande JAMAIS au LLM de réécrire le texte. On lui
demande uniquement les INDICES des mots où une phrase se termine. On insère
ensuite le "." nous-mêmes en Python. Cela garantit :
  - l'ordre des mots n'est jamais modifié
  - aucun mot n'est jamais ajouté, supprimé ou altéré
  - la sortie du LLM est minuscule (une liste d'entiers), donc ce step ne
    peut jamais être tronqué, même pour de très longues transcriptions.
"""
import json
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


BOUNDARY_SYSTEM_PROMPT = """Expert en linguistique arabe tunisien/français pour l'analyse de parole pathologique.

RÔLE : Repérer où se terminent les phrases dans une transcription ASR (dialecte tunisien + code-switching français), SANS modifier le texte.

Le texte est une liste de mots séparés par des espaces, numérotés à partir de 0. Une "fin de phrase" est un point où le sens se termine et où une nouvelle idée/phrase commence (changement de sujet, pause logique, nouvelle proposition complète).

RÈGLES STRICTES :
1. Ne répète JAMAIS le texte. Retourne uniquement les indices (entiers, base 0) du DERNIER mot de chaque phrase.
2. Les indices doivent être en ordre croissant.
3. Le dernier mot du texte doit TOUJOURS être inclus comme fin de phrase.
4. N'ajoute AUCUN commentaire, AUCUNE explication."""


class SentenceBoundaries(BaseModel):
    sentence_boundaries: List[int] = Field(
        description="Indices (base 0, ordre croissant) du dernier mot de chaque phrase. Le dernier indice doit être len(mots) - 1."
    )


def insert_punctuation(words: List[str], boundaries: List[int]) -> List[str]:
    """Insère '.' après chaque indice de frontière, sans toucher au contenu
    ou à l'ordre des mots. Retourne une NOUVELLE liste — les mots eux-mêmes
    ne sont jamais modifiés, seuls des tokens '.' sont ajoutés."""
    n = len(words)
    valid_boundaries = sorted({b for b in boundaries if 0 <= b < n})

    if not valid_boundaries or valid_boundaries[-1] != n - 1:
        valid_boundaries.append(n - 1)  # toujours fermer la dernière phrase

    punctuated: List[str] = []
    boundary_set = set(valid_boundaries)
    for i, w in enumerate(words):
        punctuated.append(w)
        if i in boundary_set:
            punctuated.append(".")
    return punctuated


class PunctuationService:
    """Service dédié à l'étape 1 : ponctuation sans réécriture du texte."""

    def __init__(self, client: AsyncOpenAI, model_name: str):
        self.client = client
        self.model_name = model_name

    async def _detect_sentence_boundaries(self, words: List[str]) -> List[int]:
        """Demande au LLM uniquement les indices de frontières. Sortie
        minuscule (liste d'entiers) -> aucun risque de troncature, même
        pour de très longues transcriptions."""
        text = " ".join(words)
        n = len(words)

        max_out_tokens = min(2000, max(200, n * 3))

        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": BOUNDARY_SYSTEM_PROMPT},
                    {"role": "user", "content": f"Texte ({n} mots, indices 0 à {n - 1}): {text}"}
                ],
                temperature=0.1,
                max_tokens=max_out_tokens,
                frequency_penalty=0.3,  # same guard as pos_tagging.py against repetition loops
                extra_body={
                    "guided_json": SentenceBoundaries.model_json_schema()
                }
            )

            choice = response.choices[0]
            if choice.finish_reason == "length":
                logger.warning(
                    f"Boundary detection truncated for {n}-word text; "
                    f"falling back to single sentence (no internal punctuation)."
                )
                return [n - 1]

            parsed = json.loads(choice.message.content)
            boundaries = parsed.get("sentence_boundaries", [])
            if not boundaries:
                return [n - 1]
            return boundaries

        except Exception as e:
            logger.error(f"Error during sentence boundary detection: {str(e)}")
            return [n - 1]  # fail safe: une seule phrase plutôt qu'un crash

    async def punctuate(self, raw_text: str) -> Dict[str, Any]:
        """
        Retourne le texte avec '.' inséré aux frontières de phrases
        détectées. Contenu, ordre et répétition des mots garantis
        identiques à l'entrée — seuls des '.' sont ajoutés entre les mots.
        """
        words = raw_text.split()
        if not words:
            return {"texte_original": raw_text, "texte_ponctue": "", "words_with_punct": []}

        boundaries = await self._detect_sentence_boundaries(words)
        words_with_punct = insert_punctuation(words, boundaries)

        return {
            "texte_original": raw_text,
            "texte_ponctue": " ".join(words_with_punct),
            "words_with_punct": words_with_punct,
        }