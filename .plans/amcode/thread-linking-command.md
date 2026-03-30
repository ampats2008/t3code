# Thread/Conversation Linking Feature

## Overview
Extend the "/" command menu to allow users to search for and attach existing or archived threads/conversations to the current conversation. This enables cross-conversation context injection and maintains continuity across related discussions.

## Problem Statement
- Users often need to reference content from previous conversations
- Currently requires manual copy-paste or switching between conversations
- No native way to link or embed thread context within a new conversation
- Archived conversations are hard to surface and reference

## Solution: Extend "@" Menu with Thread/Conversation Option

### Command Trigger
- **Activation**: Type "@" and begin typing "Threads" or "Conversations"
- **Matching**: Both terms surface the same "Threads" option
- **Behavior**: Opens a thread selection sub-menu (similar to how "@" currently surfaces people/users)
- **Integration**: Lives alongside existing "@" mention options (people, channels, etc.)

### Sub-Menu Interface

#### Primary Features
1. **Thread List Display**
   - Shows all available threads (active + archived)
   - Displays thread title/subject
   - Shows last activity date
   - Indicates thread status (Active/Archived)
   - Shows thread preview (first 50-100 chars of content)

2. **Search & Filtering**
   - Real-time search by thread title
   - Filter toggle: All / Active Only / Archived Only
   - Sort options: Recent, Oldest, Alphabetical
   - Pinned/favorite threads appear at top

3. **Thread Selection & Preview**
   - Click/select a thread to see full preview
   - Preview shows: full title, creation date, participant count, full first message/summary
   - "Attach" button to confirm selection

### Attachment Behavior

#### What Gets Attached?
- **Option 1 (Inline Reference)**: Inserts a clickable thread reference/card into the message
  - Shows thread title and link
  - User can click to jump to full thread context

- **Option 2 (Context Injection)**: Inserts thread summary at the message insertion point
  - First N messages from thread
  - Metadata (participants, date range)
  - Follows a consistent formatting template

- **Option 3 (Link + Meta)**: Creates a rich embed showing thread info + ability to expand

#### After Attachment
- User can continue composing message with context now available
- Multiple threads can be attached to single message
- Attached threads show visual indicator in message composition

### Use Cases
1. **Cross-team context**: Pull a thread from Design team into Engineering discussion
2. **Reference prior decisions**: Link to archived decision-making thread for continuity
3. **Related conversations**: Attach supporting context threads to current discussion
4. **Onboarding**: Reference thread with team standards/guidelines for new members
5. **Follow-ups**: Link back to original thread when reopening old topic

## Implementation Considerations

### Data Requirements
- Need ability to query all threads (active + archived)
- Must support searching thread content
- Need to track thread metadata (dates, participants, status)
- Preview generation for threads

### UI/UX Details
- Should feel native to existing "@" mention structure (consistent styling/behavior)
- Sub-menu should be keyboard navigable (arrow keys, Enter to select)
- Search should be instant/responsive as user types after "@Threads"
- Clear visual distinction between active/archived threads
- Graceful handling when no threads match search
- Thread option appears in "@" menu alongside other mention types (people, channels, etc.)

### Scope & Phases
- **Phase 1**: Basic thread search and selection with inline reference
- **Phase 2**: Rich thread preview and context injection options
- **Phase 3**: Thread favoriting, better search/filtering, cross-workspace threading

### Questions to Answer
1. Should archived threads be searchable/selectable by default, or opt-in view?
2. How much of the thread content should be injected vs. just a reference link?
3. Should users be able to attach thread as summary vs. full context?
4. Should there be a limit on threads that can be attached per message?
5. Does this need workspace/channel scoping, or global thread search?

## Related Features
- "@" mention system (existing) — this feature **extends** the existing mention system
- Thread API/backend (must exist for querying threads)
- Thread preview generation system
- Archive system (existing)
- Current "@" mention types (people, channels, etc.) — threads added as new mention category

## Success Metrics
- Adoption rate of thread linking in messages
- Reduction in manual context-switching between conversations
- User feedback on discoverability and usefulness
