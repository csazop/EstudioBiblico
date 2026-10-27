"""Pruebas de la API local contra una base SQLite temporal (sin red)."""

import json
import os
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

_TMP = tempfile.TemporaryDirectory()
os.environ["BIBLE_STUDY_DATA_DIR"] = _TMP.name

from bible_study.config import web_dir  # noqa: E402
from bible_study.database import Database  # noqa: E402
from bible_study.server import LocalServer  # noqa: E402


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = Database(Path(_TMP.name) / "test.db")
        cls.server = LocalServer(cls.db, web_dir())
        cls.server.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.stop()
        cls.db.close()

    def call(self, method, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        hdrs = {"Content-Type": "application/json"} if data else {}
        hdrs.update(headers or {})
        req = urllib.request.Request(self.server.url.rstrip("/") + path, data=data,
                                     method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(req) as r:
                raw = r.read()
                return r.status, json.loads(raw) if raw and "json" in r.headers["Content-Type"] else raw
        except urllib.error.HTTPError as e:
            return e.code, e.read().decode()

    def test_seed_data(self):
        status, notes = self.call("GET", "/api/studynotes")
        self.assertEqual(status, 200)
        self.assertEqual(len(notes), 2)
        status, sermons = self.call("GET", "/api/sermons")
        self.assertEqual(sermons[0]["title"], "Vivir por Fe")

    def test_note_crud(self):
        payload = {"title": "Juan 3", "studyDate": "2026-10-18", "comments": "<p>Hola</p>",
                   "bibleSections": [{"sectionIndex": 1, "version": "rv1960", "bookName": "Juan",
                                      "bookNumber": 43, "chapter": 3, "verseStart": 16,
                                      "verseEnd": 17, "content": ""}]}
        status, note = self.call("POST", "/api/studynotes", payload)
        self.assertEqual(status, 201)
        self.assertTrue(note["createdAt"].endswith("Z"))
        self.assertEqual(note["bibleSections"][0]["bookNumber"], 43)

        payload["title"] = "Juan 3 (editada)"
        payload["bibleSections"] = []
        status, note = self.call("PUT", f"/api/studynotes/{note['id']}", payload)
        self.assertEqual((status, note["title"], note["bibleSections"]),
                         (200, "Juan 3 (editada)", []))

        status, _ = self.call("DELETE", f"/api/studynotes/{note['id']}")
        self.assertEqual(status, 204)
        status, _ = self.call("GET", f"/api/studynotes/{note['id']}")
        self.assertEqual(status, 404)

    def test_sermon_crud(self):
        payload = {"title": "Gracia", "sermonDate": "2026-10-18", "theme": "t",
                   "scriptureRef": "Ef 2:8", "introduction": "", "mainPoints": "[]",
                   "conclusion": "", "notes": "", "bibleRefs": []}
        status, s = self.call("POST", "/api/sermons", payload)
        self.assertEqual(status, 201)
        status, s = self.call("GET", f"/api/sermons/{s['id']}")
        self.assertEqual(s["scriptureRef"], "Ef 2:8")
        self.assertEqual(self.call("DELETE", f"/api/sermons/{s['id']}")[0], 204)

    def test_validation_and_errors(self):
        self.assertEqual(self.call("POST", "/api/sermons", {"title": "x"})[0], 400)
        self.assertEqual(self.call("GET", "/api/nada")[0], 404)
        self.assertEqual(self.call("PATCH", "/api/sermons")[0], 501)
        self.assertEqual(self.call("GET", "/api/bible/strongs/X1")[0], 400)
        self.assertEqual(self.call("GET", "/api/bible/tisch-s/1/1")[0], 400)

    def test_versions_and_static(self):
        status, versions = self.call("GET", "/api/bible/versions")
        self.assertIn("rv1960", [v["id"] for v in versions])
        status, html = self.call("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn(b"<html", html.lower())
        self.assertEqual(self.call("GET", "/study-notes")[0], 200)
        self.assertEqual(self.call("GET", "/../bible_study/config.py")[0], 404)

    def test_rejects_foreign_host(self):
        self.assertEqual(self.call("GET", "/api/sermons", headers={"Host": "evil.com"})[0], 403)

    def test_rejects_non_json_post(self):
        req = urllib.request.Request(self.server.url + "api/sermons", data=b"a=1", method="POST",
                                     headers={"Content-Type": "text/plain"})
        with self.assertRaises(urllib.error.HTTPError) as ctx:
            urllib.request.urlopen(req)
        self.assertEqual(ctx.exception.code, 415)

    def test_commentary_proxy_validation(self):
        status, msg = self.call("GET", "/api/commentary/page?url=https%3A%2F%2Fevil.com%2Fx.htm")
        self.assertEqual(status, 400)
        self.assertEqual(self.call("GET", "/api/commentary/page")[0], 400)
        self.assertEqual(self.call("POST", "/api/translation/batch", {"texts": "no"})[0], 400)
        self.assertEqual(self.call("POST", "/api/translation/batch",
                                   {"texts": ["a"], "targetLanguage": "xx"})[0], 400)
        status, res = self.call("POST", "/api/translation/batch", {"texts": ["", "  "]})
        self.assertEqual(status, 200)
        self.assertEqual(res["translations"], ["", ""])

    def test_commentary_sanitize(self):
        from bible_study.services.commentary_service import sanitize, validate_url
        self.assertEqual(validate_url("http://www.biblehub.com/commentaries/mhc/john/3.htm"),
                         "https://biblehub.com/commentaries/mhc/john/3.htm")
        page = ('<html><head><base href="/x"><script>alert(1)</script></head>'
                '<body onload="x()"><p onclick=\'y()\'>Hi</p><iframe src="ad"></iframe></body></html>')
        out = sanitize(page, "https://biblehub.com/a.htm")
        self.assertNotIn("<script", out)
        self.assertNotIn("onload", out)
        self.assertNotIn("onclick", out)
        self.assertNotIn("<iframe", out)
        self.assertIn('<head><base href="https://biblehub.com/a.htm" target="_blank">', out)
        self.assertEqual(out.count("<base"), 1)


if __name__ == "__main__":
    unittest.main()
