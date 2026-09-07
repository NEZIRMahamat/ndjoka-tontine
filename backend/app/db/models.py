"""Registre des modèles SQLAlchemy chargés par Alembic.

Chaque nouveau module métier ajoutera ici l'import de ses modèles afin que
leurs tables soient présentes dans ``Base.metadata`` lors de l'autogénération.
"""

from app.db.base import Base


def load_all_models() -> tuple[type[Base], ...]:
    """Importer et retourner tous les modèles déclaratifs connus."""
    from app.modules.memberships.models import Invitation, Membership
    from app.modules.tontines.models import Tontine
    from app.modules.users.models import User

    return (User, Tontine, Membership, Invitation)
