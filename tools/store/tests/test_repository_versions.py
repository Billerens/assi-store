"""The rule of this repository: every package carries a SemVer version, and a published version
never changes its contents. Reads sources only; nothing is built, fetched or run."""
import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parents[1]
ROOT = TOOLS.parents[1]
sys.path.insert(0, str(TOOLS))
import versions  # noqa: E402

# Left out of the catalog by the build as well: its saves live under a path format v1 cannot name.
EXCLUDED = ['sparks-ring']


class RepositoryVersions(unittest.TestCase):
    def test_every_package_version_matches_its_published_contents(self):
        result = versions.check(ROOT, (ROOT / 'LICENSE').read_bytes(), EXCLUDED)
        self.assertEqual([], result['errors'], 'Raise "version" in store.json of each changed package (see README.md, "Версии").')

    def test_everything_offered_by_the_index_is_recorded_as_released(self):
        result = versions.check(ROOT, (ROOT / 'LICENSE').read_bytes(), EXCLUDED)
        self.assertEqual([], result['toRelease'], 'Committed sources are ahead of index.json: build, publish and record the release.')


if __name__ == '__main__':
    unittest.main()
