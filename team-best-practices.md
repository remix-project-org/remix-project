
# Team best practices

This document aims to address contributors best practices of the following repositories:
 - Remix Project: https://github.com/remix-project-org/remix-project
 - Remix Libraries: https://github.com/remix-project-org/remix-project/tree/master/libs

This document is not in its final version, **a team meeting which aims to address new/old best practices, feedback, workflows, all kind of issues related to how the team works together occurs every 2 weeks.**
This document link to other specialized best practices (like coding best practices).

Related links:
 - Public Website: https://remix-project.org
 - Awesome Remix: https://github.com/remix-project-org/awesome-remix
 - Remix basic FAQ: https://hackmd.io/KVooMJhWRImCGq6zkDgW9A
 - Remix live: https://remix.ethereum.org
 - Remix alpha live: https://alpha.remix.live
 - Remix beta live: https://beta.remix.live
 - Remix-lib NPM module: https://www.npmjs.com/package/@remix-project/remix-lib
 - Remix-solidity NPM module: https://www.npmjs.com/package/@remix-project/remix-solidity
 - Remix-debug NPM module: https://www.npmjs.com/package/@remix-project/remix-debug
 - Remix-tests NPM module: https://www.npmjs.com/package/@remix-project/remix-tests
 - Remix documentation: http://remix-ide.readthedocs.io/en/latest/
 - Discord: https://discord.gg/4b2rE9U4D2
 
---

# Team communication

 ### 1) Team meetings:
 
 - Daily standup (1pm CET - 11am GMT) for taking care of the current issues.
 
 - A regular standup - each Tuesday (3pm CET - 1pm GMT) - which aim to 
    - Update every contributor on what others are doing.
    - Update the prioritised issues / PRs list.
    - Address little issues (possibly related to the current ongoing milestone).
    - High level demo, explanation about specific points of the codebase or Ethereum related things.

 - A milestone standup - scheduled before the beginning of each milestone, roughly on a monthly basis - which aim to define what will be included in the **next milestone** and who will work on what. This standup also help to set a clear long term vision.
 
 - A retrospective standup - after each release - which aims to talk about **best practices in general**: what is good, what is bad, how we can improve workflows.

 - A tour standup - Just after a release or whenever it is needed - which aim to demo, **explain in details** features, bug fixes or any part of the codebase.
 
 
 ### 2) Group meetings:
 
 - When a story / bug fix is divided in parts, there should be a kickstart meeting with all the developers involved, so that all the devs have a good overview / understanding on:
     - How the story fits into the Ethereum tech.
     - How the backend (if any) works / will work (could be a smart contract).
     - How the frontend works / will work.
     - What is the general vision of the UX design for this particular story.
     Later progress and discussion is updated directly on the issue or pull request (GitHub).
 
---

# Prerequisites:

Before starting coding, we should ensure all devs / contributors are aware of: 
- Where the codebase is.
- How to setup and get started (always up to date).
- How to run tests.
- Where to find documentation.
- How to reach us through the communication channels - https://discord.gg/4b2rE9U4D2
- The following best practices:

---

# Story / Bug fix

- Prioritised list of PRs / issues are tracked in a GitHub Project, Remix IDE issues are managed by a prioritized backlog.
- Every story can be executed by a single developer or a group of 2 or more developers (depending on the size and complexity)
- Each dev should take the part he/she feels the most comfortable with.
- Later progress and discussion is updated directly on the issue or pull request (github).
- When a developer or team decides on the story they want to work on (at the start of milestone for instance), they assign themselves to the issue. 
- Documentation update should be done together with the story, or an issue with the label "documentation" has to be created.

---

# Pull Requests

 ### 1) PR Creator:
 
 - It is recommended to use the emoji responses to signal agreement or that you've seen a comment and will address it rather than replying. This reduces github inbox spam.
 - Mark unfinished pull requests with the `Work in Progress` label
 - Large pull requests (above 200-400 lines of code changed) cannot be effectively reviewed and should be split into smaller pieces.
 - Code should comply to the `JavaScript standard style` - https://www.npmjs.com/package/standard
 - You should not expect complete review on a pull request which is not passing CI.
 - You can obviously ask for feedback on your approach.
 - You should assign a reviewer(s).
 - Pull requests should be used as a reference to update coding best practices whenever it is needed.

 ### 2) Review:
 
 - Everyone is free to review any pull request.
 - You should add the label "change requested" or "accepted".
 - When reviewing people's code consider the following two comments.
    > I don't like the name of this function.

    vs.

    > What do you think about changing the name of this function to ....

    Your feedback will often be better received if you pose it in the form of a question.

 - Pull request should be reviewed to comply to coding best practices.
 - You should take the responsibility of the PR you are reviewing.
 - You should make sure the app is viable after the PR is being merged.
 - You should make sure the PR is correctly tested (e2e tests, unit tests)
 - Ideally You should have enough knowledge to be able to fix related bugs.
      
 ### 3) Merge:

 - Merging is possible after Review and Tests are ok and when the PR is approved.
 - After a merge, it is highly recommended to check the new code in `alpha.remix.live`

---

# Milestone

 - A milestone should **only** contain items we are sure to finish.
 - The end of a milestone triggers a new release.
 - Milestone items and duration should take into account time spent in bugs fixing and support.
 - The team should commit to the milestone duration.
 - If a dev finish early he/she can help others to push remaining tasks.
 - If a dev finish early he/she can work on specifying / integrating the next milestone.
 - A milestone duration is fixed at the start of the milestone (but should better not exceed 1 month).
 - Progress and issues regarding a milestone are discussed on regular standups.
 

# Milestone - Refinement meeting

 - A meeting is organized 3 weeks after the beginning of a round. This aims to :
   - list what is left to do.
   - identify any blocker.
   - agree on a release date (which can be earlier 1 week after the meeting and not later than 4 weeks after the meeting.
   - add issues that are eligible to get in the release.
   - remove issues that aren't doable in time or represent a risk.
   - plan for asking feedback about new features (in social media).

---

# Releases
 
 ### 1) Process:
 - Should be documented and updated.
 - A new release is triggered:
    - after an important bug fix
    - at the end of a milestone
 - We can release an `m.m.m-alpha.x` (whenever we need to release and for whatever reasons) being in between a feature / bug fix completion.
 - We release an `m.m.x` whenever there is a bug fix.
 - We release an `m.x.0` whenever there is a new feature.
 - We release an `x.0.0` after each milestone we consider being an important progress.
 - We release an `x.0.0` if there's an API breaking change in one of our libraries.
 - After a new release we should stay in alert for possible regression and better not release Friday at 5pm :)

 ### 2) Community:
 - Before the official release, we should select a group of power users and invite them to test and give feedbacks.
 - Users need to know upfront a new release is coming and we should prepare them for it by showcasing some new features they can expect and when it will happen (fixed date, published at least 1 week in advance).
 - Whenever we have a new release we have to communicate this efficiently (twitter, reddit, ...).

---

# Maintenance


### 1) Bugs:
- A critical bug should get the label `Blocker`, and every effort should be put to fix it.
- Addressing a non critical and non planned bug can be done:
  - After having notified in the `remix-dev` channel if the bug does not involve UX or public API changes.
  - After a dev meeting (e.g the regular standup) if the bug involves any UX or public API changes.

### 2) Support:

- We should all keep an eye on the public non dev channel and file user feedback.

### 3) Documentation:

- The documentation is done / updated just after the feature / release in a team effort.
- Documentation work is fileable as a github issue.
- It is encouraged to find and link associated doc produced by the community (blog posts, videos, tutorials, ...)

---

# Coding best practices

 - https://github.com/ethereum/remix-project/blob/master/CONTRIBUTING.md
