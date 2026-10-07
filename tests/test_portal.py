"""Client invitations, the client portal and its separation from internal work."""
import unittest

from tests.test_workspace import PASSWORD, FirmFixture


class PortalFixture(FirmFixture):
    def setUp(self):
        super().setUp()
        self.matter = self.open_matter()
        self.mid = self.matter["id"]
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/members", json={"user_id": self.associate["user"]["id"]})
        self.client_user = self.invite_client(self.mid, "Cara Client", "cara@client.test")

    def invite_client(self, matter_id, name, email, who=None):
        invite = self.call(who or self.partner, "post", f"/firm/matters/{matter_id}/clients", json={"name": name, "email": email})
        self.assertEqual(invite.status_code, 201, invite.text)
        if not invite.json()["code"]:
            return None
        joined = self.client.post("/api/auth/join", json={"code": invite.json()["code"], "password": PASSWORD})
        self.assertEqual(joined.status_code, 201, joined.text)
        return joined.json()

    def portal(self, who=None, matter_id=None):
        return self.call(who or self.client_user, "get", f"/portal/matters/{matter_id or self.mid}")


class ClientInvitationTests(PortalFixture):
    def test_client_account_is_linked_only_to_the_invited_matter(self):
        self.assertEqual(self.client_user["user"]["role"], "client")
        other = self.open_matter(name="Unrelated matter")
        listed = self.call(self.client_user, "get", "/portal/matters").json()
        self.assertEqual([m["id"] for m in listed], [self.mid])
        self.assertEqual(self.portal(matter_id=other["id"]).status_code, 404)

    def test_inviting_the_same_client_to_a_second_matter_reuses_the_account(self):
        second = self.open_matter(name="Second matter")
        self.assertIsNone(self.invite_client(second["id"], "Cara Client", "cara@client.test"))
        self.assertEqual(len(self.call(self.client_user, "get", "/portal/matters").json()), 2)

    def test_staff_emails_and_other_firms_cannot_become_clients(self):
        for email in ("assoc@firm-a.test", "admin@firm-b.test"):
            response = self.call(self.partner, "post", f"/firm/matters/{self.mid}/clients", json={"name": "X", "email": email})
            self.assertEqual(response.status_code, 409)

    def test_paralegals_cannot_invite_clients(self):
        response = self.call(self.paralegal, "post", f"/firm/matters/{self.mid}/clients", json={"name": "X", "email": "x@client.test"})
        self.assertEqual(response.status_code, 403)


class PortalSeparationTests(PortalFixture):
    def test_clients_are_refused_every_firm_route(self):
        for path in ("/firm/matters", f"/firm/matters/{self.mid}", f"/firm/matters/{self.mid}/tasks", f"/firm/matters/{self.mid}/comments",
                     f"/firm/matters/{self.mid}/activity", f"/firm/matters/{self.mid}/client-room", "/firm/members"):
            self.assertIn(self.call(self.client_user, "get", path).status_code, (403, 404), path)
        self.assertIn(self.call(self.client_user, "post", f"/firm/matters/{self.mid}/comments", json={"body": "x"}).status_code, (403, 404))

    def test_staff_cannot_use_portal_routes(self):
        self.assertEqual(self.call(self.partner, "get", "/portal/matters").status_code, 403)

    def test_internal_work_never_appears_in_the_portal(self):
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/comments", json={"body": "INTERNAL strategy note"})
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/tasks", json={"title": "INTERNAL task"})
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/walls", json={"user_id": self.paralegal["user"]["id"], "reason": "INTERNAL conflict"})
        self.call(self.associate, "post", f"/firm/matters/{self.mid}/updates", json={"title": "INTERNAL draft", "body": "not yet approved"})
        body = self.portal().text
        self.assertNotIn("INTERNAL", body)
        self.assertNotIn("member_ids", body)
        self.assertNotIn("walled", body)


class SharedUpdateTests(PortalFixture):
    def test_updates_reach_the_client_only_after_partner_approval_and_sharing(self):
        update = self.call(self.associate, "post", f"/firm/matters/{self.mid}/updates", json={"title": "Status", "body": "Notice served."}).json()
        base = f"/firm/matters/{self.mid}/updates/{update['id']}"
        self.assertEqual(self.call(self.associate, "post", f"{base}/share").status_code, 409)
        self.assertEqual(self.call(self.associate, "post", f"{base}/approve").status_code, 403)
        self.assertEqual(self.portal().json()["updates"], [])
        self.assertEqual(self.call(self.partner, "post", f"{base}/approve").json()["approved_by"], "Pat Partner")
        self.assertEqual(self.portal().json()["updates"], [])
        self.assertEqual(self.call(self.associate, "post", f"{base}/share").status_code, 200)
        self.assertEqual([u["title"] for u in self.portal().json()["updates"]], ["Status"])


class MessagingAndDocumentTests(PortalFixture):
    def test_client_messages_are_separate_from_comments_and_notify_members(self):
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/comments", json={"body": "Internal only"})
        self.call(self.associate, "post", f"/firm/matters/{self.mid}/client-messages", json={"body": "Hello from the firm"})
        sent = self.call(self.client_user, "post", f"/portal/matters/{self.mid}/messages", json={"body": "Thanks, see attached."})
        self.assertEqual(sent.json()["author_kind"], "client")
        thread = [m["body"] for m in self.portal().json()["messages"]]
        self.assertEqual(thread, ["Hello from the firm", "Thanks, see attached."])
        comments = [c["body"] for c in self.call(self.partner, "get", f"/firm/matters/{self.mid}/comments").json()]
        self.assertEqual(comments, ["Internal only"])
        for who in (self.partner, self.associate):
            inbox = self.call(who, "get", "/firm/notifications").json()
            self.assertEqual(inbox["items"][0]["kind"], "client.message")

    def test_document_request_upload_is_hashed_limited_and_scoped(self):
        request = self.call(self.associate, "post", f"/firm/matters/{self.mid}/document-requests", json={"title": "Signed lease"}).json()
        upload = lambda who, content: self.client.post(f"/api/portal/document-requests/{request['id']}/upload", headers={"Authorization": f"Bearer {who['token']}"}, files={"file": ("lease.pdf", content, "application/pdf")})
        self.assertEqual(upload(self.client_user, b"").status_code, 422)
        self.assertEqual(upload(self.client_user, b"x" * (10 * 1024 * 1024 + 1)).status_code, 413)
        self.assertEqual(upload(self.partner, b"staff cannot use the portal").status_code, 403)
        done = upload(self.client_user, b"synthetic signed lease")
        self.assertEqual(done.status_code, 201)
        import hashlib
        self.assertEqual(done.json()["sha256"], hashlib.sha256(b"synthetic signed lease").hexdigest())
        room = self.call(self.associate, "get", f"/firm/matters/{self.mid}/client-room").json()
        self.assertEqual(room["requests"][0]["status"], "fulfilled")
        doc_id = room["requests"][0]["documents"][0]["id"]
        self.assertEqual(self.call(self.associate, "get", f"/firm/client-documents/{doc_id}").content, b"synthetic signed lease")
        self.assertEqual(self.call(self.client_user, "get", f"/portal/documents/{doc_id}").content, b"synthetic signed lease")
        self.assertEqual(self.call(self.paralegal, "get", f"/firm/client-documents/{doc_id}").status_code, 404)
        self.assertEqual(self.call(self.other_firm, "get", f"/firm/client-documents/{doc_id}").status_code, 404)
        self.assertEqual(self.call(self.associate, "get", "/firm/notifications").json()["items"][0]["kind"], "client.document")

    def test_a_second_client_cannot_reach_another_clients_matter(self):
        other_matter = self.open_matter(name="Other client matter")
        other_client = self.invite_client(other_matter["id"], "Olu Other", "olu@client.test")
        self.assertEqual(self.portal(who=other_client).status_code, 404)
        self.assertEqual(self.call(other_client, "post", f"/portal/matters/{self.mid}/messages", json={"body": "peek"}).status_code, 404)


if __name__ == "__main__":
    unittest.main()
