"""add_transcription_text_to_patients

Revision ID: 9f592cac5a0f
Revises: 
Create Date: 2026-07-31 14:25:54.015319

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9f592cac5a0f'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Ajoute la nouvelle colonne à la table patients
    op.add_column('patients', sa.Column('transcription_text', sa.Text(), nullable=True))

def downgrade() -> None:
    # Permet de faire un rollback si besoin
    op.drop_column('patients', 'transcription_text')
