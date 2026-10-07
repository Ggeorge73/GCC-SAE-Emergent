"""Comments, mentions, notifications and the activity feed against the in-process store."""
import unittest

from tests.test_workspace import FirmFixture


class CollaborationFixture(FirmFixture):
    def setUp(self):
        super().setUp()
        self.matter = self.open_matter()
        self.mid = self.matter["id"]
        for who in (self.associate, self.paralegal):
            self.call(self.partner, "post", f"/firm/matters/{self.mid}/members", json={"user_id": who["user"]["id"]})

    def comment(self, who, body, mentions=()):
        return self.call(who, "post", f"/firm/matters/{self.mid}/comments", json={"body": body, "mention_ids": list(mentions)})

    def inbox(self, who):
        return self.call(who, "get", "/firm/notifications").json()


class CommentTests(CollaborationFixture):
    def test_author_comes_from_the_session_not_the_request(self):
        response = self.call(self.associate, "post", f"/firm/matters/{self.mid}/comments", json={"body": "Drafted.", "author_name": "Maya Chen", "author_id": self.partner["user"]["id"]})
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual((body["author_id"], body["author_name"], body["author_role"]), (self.associate["user"]["id"], "Ash Associate", "associate"))
        self.assertEqual(body["visibility"], "internal")

    def test_members_share_the_thread_in_order(self):
        self.comment(self.partner, "First")
        self.comment(self.associate, "Second")
        thread = self.call(self.paralegal, "get", f"/firm/matters/{self.mid}/comments").json()
        self.assertEqual([c["body"] for c in thread], ["First", "Second"])

    def test_non_members_walled_users_and_other_firms_cannot_read_or_post(self):
        self.comment(self.partner, "Privileged analysis")
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/walls", json={"user_id": self.paralegal["user"]["id"], "reason": "Conflict"})
        outsider = self.join(self.admin, "Out Sider", "out@firm-a.test", "associate")
        for who in (self.paralegal, outsider, self.other_firm):
            self.assertEqual(self.call(who, "get", f"/firm/matters/{self.mid}/comments").status_code, 404)
            self.assertEqual(self.comment(who, "Let me in").status_code, 404)
            self.assertEqual(self.call(who, "get", f"/firm/matters/{self.mid}/activity").status_code, 404)


class MentionAndNotificationTests(CollaborationFixture):
    def test_mention_notifies_only_valid_members(self):
        outsider = self.join(self.admin, "Out Sider", "out@firm-a.test", "associate")
        posted = self.comment(self.partner, "@Ash please review", [self.associate["user"]["id"], outsider["user"]["id"], self.other_firm["user"]["id"], self.partner["user"]["id"]]).json()
        self.assertEqual(posted["mention_ids"], [self.associate["user"]["id"]])
        inbox = self.inbox(self.associate)
        self.assertEqual(inbox["unread"], 1)
        self.assertEqual(inbox["items"][0]["kind"], "mention")
        self.assertIn("Pat Partner mentioned you", inbox["items"][0]["text"])
        for who in (outsider, self.other_firm, self.partner):
            self.assertEqual(self.inbox(who)["unread"], 0)

    def test_task_assignment_notifies_the_assignee_but_not_self(self):
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/tasks", json={"title": "Serve notice", "assignee_id": self.associate["user"]["id"]})
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/tasks", json={"title": "My own task", "assignee_id": self.partner["user"]["id"]})
        self.assertEqual([n["kind"] for n in self.inbox(self.associate)["items"]], ["task.assigned"])
        self.assertEqual(self.inbox(self.partner)["unread"], 0)
        task = self.call(self.partner, "post", f"/firm/matters/{self.mid}/tasks", json={"title": "Reassign me"}).json()
        self.call(self.partner, "patch", f"/firm/tasks/{task['id']}", json={"assignee_id": self.paralegal["user"]["id"]})
        self.assertIn("Reassign me", self.inbox(self.paralegal)["items"][0]["text"])

    def test_users_only_read_and_clear_their_own_notifications(self):
        self.comment(self.partner, "Ping", [self.associate["user"]["id"]])
        note = self.inbox(self.associate)["items"][0]
        self.assertEqual(self.call(self.paralegal, "post", f"/firm/notifications/{note['id']}/read").status_code, 404)
        self.assertEqual(self.call(self.associate, "post", f"/firm/notifications/{note['id']}/read").status_code, 200)
        self.assertEqual(self.inbox(self.associate)["unread"], 0)
        self.comment(self.partner, "Ping again", [self.associate["user"]["id"]])
        self.assertEqual(self.call(self.associate, "post", "/firm/notifications/read-all").json(), {"read": 1})

    def test_a_wall_hides_earlier_notifications_about_the_matter(self):
        self.comment(self.partner, "Before the wall", [self.paralegal["user"]["id"]])
        self.assertEqual(self.inbox(self.paralegal)["unread"], 1)
        self.call(self.partner, "post", f"/firm/matters/{self.mid}/walls", json={"user_id": self.paralegal["user"]["id"], "reason": "Conflict"})
        self.assertEqual(self.inbox(self.paralegal), {"unread": 0, "items": []})


class ActivityFeedTests(CollaborationFixture):
    def test_feed_lists_server_recorded_events_newest_first(self):
        self.comment(self.associate, "Status update")
        feed = self.call(self.paralegal, "get", f"/firm/matters/{self.mid}/activity").json()
        self.assertEqual(feed[0]["action"], "comment.posted")
        self.assertEqual(feed[0]["actor_name"], "Ash Associate")
        self.assertEqual(feed[-1]["action"], "matter.opened")

    def test_feed_has_no_edit_or_delete_route(self):
        entry = self.call(self.partner, "get", f"/firm/matters/{self.mid}/activity").json()[0]
        for method in ("patch", "put", "delete"):
            self.assertIn(self.call(self.partner, method, f"/firm/matters/{self.mid}/activity").status_code, (404, 405))
            self.assertIn(self.call(self.partner, method, f"/firm/activity/{entry['id']}").status_code, (404, 405))


if __name__ == "__main__":
    unittest.main()
