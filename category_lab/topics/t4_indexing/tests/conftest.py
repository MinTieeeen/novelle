"""Make `topics.t4_indexing` importable when pytest is pointed at this folder:
    uv run pytest topics/t4_indexing/tests        (from category_lab/, inside the lab container)
The modules under test (copies, ddl, plans, redisidx) need no database."""
import sys
from pathlib import Path

LAB_DIR = Path(__file__).resolve().parents[3]          # .../category_lab
if str(LAB_DIR) not in sys.path:
    sys.path.insert(0, str(LAB_DIR))
