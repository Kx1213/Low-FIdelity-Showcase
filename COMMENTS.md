# Website comments

Visitors can highlight page text and choose **Add comment**, or open **Comments**
to read the discussion. Each comment keeps a quote of the selected text. Comments
and replies update live and are public.

## Shared editing, Delete and Undo

Everyone can edit or delete any comment or reply, including posts left by other
visitors. The website automatically signs visitors in anonymously when they
post or make changes; there is no sign-up form. Knowing the original author or
using the same browser is not required.

Editing changes the post's text and records a server timestamp. The original
author's name, creation time and selected-text anchor remain unchanged. **Delete**
hides the post's text in the website and shows a deleted-post notice. **Undo**
restores it. Anyone can use Undo, and a deleted post must be restored before its
text can be edited.

Deletion is reversible: Firestore retains the original text, author, timestamps,
selected quote and replies. Public database readers can still retrieve that
stored text; Delete is not permanent erasure. The Firebase project owner can
manage permanently removing data in the console.

## Firebase

- Project: `b71-showcase-comments` (Spark plan)
- Firestore database: `(default)`, `asia-southeast2` (Jakarta)
- Web app: `B71 Opportunity Website`
- Anonymous authentication identifies new-post authors and enables shared changes without a sign-up form.
- Public web settings are in `assets/firebase-config.js`; these are not admin credentials.
- Access rules are retained in `firestore.rules`, mapped by `firebase.json`.

Threads are stored at `pageComments/{pageId}/threads/{threadId}`; replies are in
its `replies/{replyId}` subcollection. The directory uses `directory`; detail
pages use stable IDs `opportunity-1` through `opportunity-17`. Changing a headline
does not create a separate discussion.

Rules allow public reading of those discussions, validate the fields and server
timestamps on new posts, and allow any anonymously signed-in visitor to edit,
reversibly delete or Undo any post. Author identity, display name, creation time
and selected-text anchor cannot be changed. Browser clients cannot permanently
delete documents or access unrelated collections. Existing posts created before
editing was added remain supported.

## Maintaining the site

Run `python3 build.py` after editing content or templates. It includes the shared
comment assets on every generated page. Serve the folder over HTTP for preview;
opening an HTML file directly does not support the JavaScript modules.

Firebase SDK modules load from Google's CDN and require an internet connection.
The optional display name is remembered locally. Comments and replies are stored
in Firebase, and Firebase Authentication retains the anonymous browser identity.
If quoted text changes, the comment stays visible with its original quote.
Older discussions remain available through **Load older comments/replies**.

Changes to the local rules file must also be published to the Firebase project.
With the Firebase CLI installed and signed in, use:

```sh
firebase deploy --only firestore:rules --project b71-showcase-comments
```

Clearly labelled example comments and replies on the first opportunity are used
to verify shared reading, posting, persistence and shared changes. Reversible
deletion is used to leave feature-test posts hidden in the website.
