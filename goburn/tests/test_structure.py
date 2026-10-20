from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

BASE=Path(__file__).resolve().parents[1]

class Scan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=set()
        self.names=[]
        self.plans=[]
        self.links=[]
        self.steps=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if "id" in a: self.ids.add(a["id"])
        if "name" in a: self.names.append(a["name"])
        if "data-plan" in a: self.plans.append(a["data-plan"])
        if tag=="a": self.links.append(a.get("href",""))
        if "data-step" in a: self.steps.append(a["data-step"])

class GoBurnStaticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html=(BASE/"index.html").read_text(encoding="utf-8")
        cls.js=(BASE/"app.js").read_text(encoding="utf-8")
        cls.backend=(BASE/"backend/goburn-api/index.ts").read_text(encoding="utf-8")
        cls.schema=(BASE/"backend/001_schema.sql").read_text(encoding="utf-8")
        cls.parse=Scan()
        cls.parse.feed(cls.html)
    def test_exactly_three_paid_plans(self):
        self.assertEqual(sorted(self.parse.plans), ["blueprint","essencial","estrategico"])
        for price in ("297","897","1.997"):
            self.assertIn(price,self.html)
    def test_five_stages_and_required_sections(self):
        self.assertEqual(self.parse.steps,["0","1","2","3","4"])
        for field in ("problem","current_process","solution","budget","timeline","decision","privacy"):
            self.assertIn(field,self.parse.names)
        for required_id in ("modal","checkoutForm","gate","questionnaire","caseForm","complete"):
            self.assertIn(required_id,self.parse.ids)
    def test_checkout_does_not_collect_paid_case_early(self):
        self.assertIn('request("status"',self.js)
        self.assertIn('request("submit"',self.js)
        self.assertIn('data.status==="paid"',self.js)
        self.assertNotIn("service_role",self.js.lower())
        self.assertNotIn("APP_USR-",self.js)
    def test_backend_has_financial_checks(self):
        for fragment in ("signatureValid","verifySignature","transaction_amount","external_reference","amount_cents","payment.status===\"approved\"","order.status!==\"paid\"","authorizedOrder","goburn_staff"):
            self.assertIn(fragment,self.backend)
        self.assertNotIn('from("goburn_orders").update({status:p.status',self.backend) # no arbitrary client payment status assignment
    def test_database_denies_public_reads(self):
        for fragment in ("enable row level security","revoke all on table public.goburn_orders from anon, authenticated","revoke all on table public.goburn_cases from anon, authenticated"):
            self.assertIn(fragment,self.schema.lower())
    def test_policy_links_present(self):
        for path in ("./termos.html","./privacidade.html"):
            self.assertIn(path,self.parse.links)
            self.assertTrue((BASE/path[2:]).exists())
    def test_prelaunch_protects_from_live_charge(self):
        cfg=(BASE/"config.js").read_text(encoding="utf-8")
        self.assertRegex(cfg,r'apiBase:\s*""')
        self.assertIn('if(!api)',self.js)
        self.assertIn('noindex,nofollow',self.html)
    def test_dedicated_admin(self):
        admin=(BASE/"admin/index.html").read_text(encoding="utf-8")
        self.assertIn('signInWithPassword',admin)
        self.assertIn('admin-dashboard',admin)
        self.assertIn('admin-update',admin)
        self.assertIn('noindex,nofollow',admin)

if __name__=="__main__":
    unittest.main()
