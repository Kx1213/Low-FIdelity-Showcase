# Website comments

Visitors can highlight page text and choose **Add comment**, or open **Comments**
to read the discussion. Each comment keeps a quote of the selected text. Replies
and comments update live and are public.

## Firebase

- Project: `b71-showcase-comments` (Spark plan)
- Firestore database: `(default)`, `asia-southeast2` (Jakarta)
- Web app: `B71 Opportunity Website`
- Anonymous authentication identifies posts without a sign-up form.
- Public web settings are in `assets/firebase-config.js`; these are not admin credentials.
- Deployed access rules are retained in `firestore.rules`, mapped by `firebase.json`.

Data is stored at
`pageComments/{pageId}/threads/{threadId}/replies/{replyId}`.
The directory uses `directory`; detail pages use stable IDs `opportunity-1`
through `opportunity-17`, so changing a headline or local preview address does
not create a separate discussion.

Only correctly shaped, timestamped posts belonging to the anonymous author can
be created. Browser clients cannot edit or delete posts or access unrelated
collections. The Firebase project owner can manage comments in the console.

## Maintaining the site

Run `python3 build.py` after editing content or templates. It includes the shared
comment assets on every generated page. Serve the folder over HTTP for preview;
opening an HTML file directly does not support the JavaScript modules.

Firebase SDK modules load from Google's CDN and require an internet connection.
Only the optional display name is remembered locally; comment storage is Firebase.
If quoted text changes, the comment stays visible with its original quote.
Older discussions remain available through **Load older comments/replies**.

Changes to the local rules file must also be published to the Firebase project.
With the Firebase CLI installed and signed in, use:

```sh
firebase deploy --only firestore:rules --project b71-showcase-comments
```

One clearly labelled example comment and reply on the first opportunity were
used to verify shared reading, posting and persistence.
