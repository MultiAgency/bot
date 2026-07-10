# Building the foundation for an automated content coordination system

## Executive Summary

The current proposal provides a strong foundation for an AI-assisted contributor coordination system. However, from a system architecture perspective, it still sits somewhere between an automated workflow and a true agentic system.

The most important point to clarify is that the operating process must be defined as an official chain of states, instead of stopping at human approval. The standard workflow should be:

- Signal / request
- Reason & draft
- Human approval
- Route
- Claim
- Submit
- Review
- Amplify

Without clearly describing each step, the system will become ambiguous around request intake, reasoning and drafting, approval, task distribution, task claiming, submission, review, and amplification after completion.

In addition, the system must address two very practical questions from the beginning:

- How can tasks be distributed to the right candidates?
- How can users submit work in a clear, structured way that is standardized as files?

These two capabilities should not be treated as secondary features. They must be core parts of the workflow engine and intelligence layer. If tasks are not distributed to the right people, output quality will decline, reviewers will become overloaded, and strong contributors will quickly lose motivation. If submissions are not standardized from the beginning, the system will be difficult to verify, difficult to store, and difficult to automate for future review.

In this design, submissions must be standardized as files. When a user sends a URL, the system will use a default API/tool to fetch the content from the URL, convert it into a standardized file, and only then send that file into the analysis pipeline. This ensures that AI analyzes files rather than handling raw URLs directly.

Another important requirement is:

- How should candidates be evaluated after registration?

The answer is that the system must have a clear onboarding process. After a user registers, the platform evaluates the candidate through Twitter and Telegram to create an initial trust profile. Signals from both channels are used to determine suitability, credibility, task participation ability, and risk level for each candidate.

This proposal recommends separating the platform into independent layers so Version 1 can remain simple while allowing later versions to evolve into a fully automated coordination system without major architectural changes.

The goal is not to build a simple Telegram bot.

The goal is to build an Agentic Operating System for MultiAgency, where Telegram is only an access interface into the system, and the Telegram bot is implemented with the Telegraf framework to ensure clear structure, extensibility, and maintainability.

# Vision

Instead of creating another workflow bot, we should build an operating system that can continuously observe the ecosystem, understand opportunities, coordinate contributors, and improve decisions over time.

```
External ecosystem
        │
        ▼
 Intelligence layer
        │
        ▼
 Workflow layer
        │
        ▼
 Communication layer
```

This separation allows each component to evolve independently while maintaining a clean and clear architecture.

# Standard Operating Workflow

This is the core operating chain that the system must support end to end.

```
Signal / request
↓
Reason & draft
↓
Human approval
↓
Route
↓
Claim
↓
Submit
↓
Review
↓
Amplify
```

## 1. Signal / request

This is the starting point of the entire system.

A signal can come from:

- An event in the ecosystem
- A request from the internal team
- A request from the community
- A social media signal
- A content opportunity detected by an agent
- A task manually created by a human

At this step, the system only records the input signal, performs a preliminary classification, and stores the initial context.

### Goals of this step

- Determine whether this is an opportunity worth handling
- Record the signal source
- Attach initial metadata
- Send the signal into the reasoning queue

## 2. Reason & draft

After receiving a signal, the agent begins reasoning and creates a draft.

At this step, the agent will:

- Analyze the context
- Determine the task objective
- Recommend the appropriate content type or work type
- Estimate difficulty
- Estimate execution time
- Recommend a reward level
- Recommend suitable contributors
- Recommend submission requirements if needed
- Draft the task in a clear and structured format

### Goals of this step

- Turn a raw signal into an approvable task
- Create a draft clear enough for human evaluation
- Reduce the time required to draft tasks manually
- Standardize input quality

## 3. Human approval

This is the human control point.

Humans can:

- Approve the task
- Reject the task
- Edit the task
- Adjust the reward
- Adjust the deadline
- Adjust submission requirements
- Adjust the contributor group allowed to receive the task

### Goals of this step

- Ensure the task fits the team strategy
- Preserve human control over important decisions
- Prevent the agent from automatically creating unsuitable tasks
- Confirm that the task is ready for distribution

## 4. Route

After a task is approved, the system must route it to the right person or group.

This is a very important step because it determines who the task goes to, based on which criteria, and in what context.

### Routing should be based on factors such as:

- Relevant skills
- Prior experience
- Contributor credibility
- Availability
- Current workload
- Task risk level
- Required submission type
- History of completing similar tasks
- Candidate evaluation results after registration through Twitter and Telegram

### Goals of this step

- Send the task to the right person
- Avoid random distribution
- Reduce reviewer load
- Improve output quality
- Increase on-time completion rate

## 5. Claim

After a task is routed, a contributor can claim that task.

Claiming is the official action indicating that the contributor accepts the task and takes responsibility for completing it.

### Claiming must ensure that:

- Only one person or one group can claim at a time
- The task can be temporarily locked after being claimed
- There is a claim time limit
- A claim can be rejected if the contributor is not eligible
- The task can be rerouted if nobody claims it within the allowed time

### Goals of this step

- Clearly identify who is responsible
- Avoid task disputes
- Avoid duplicate claims
- Create clear accountability for each contributor

## 6. Submit

After completing the work, the contributor submits the result.

Submission is not only about sending the output. It also includes all data needed for the system to verify and store the result.

### A submission should include:

- Completed content
- Attached file or standardized result file
- Source link if any
- Relevant metadata
- Additional notes
- Version information if the task has multiple revision rounds

### File-based submission standardization rules

- Submissions must be stored as standardized files
- If a user sends text, the system converts the text into a file
- If a user sends a URL, the system uses a default API/tool to fetch the content from the URL and convert it into a file
- If a user sends an image, video, PDF, document, or attachment, the system stores it directly as a file
- AI only receives standardized files for analysis
- Do not allow AI to process raw URLs directly if avoidable

### Goals of this step

- Record the work result
- Standardize output data
- Prepare for review
- Enable submission verification
- Ensure AI always works on files rather than fragmented URL data

## 7. Review

The reviewer checks the submission.

This step verifies task quality, validity, and completion level.

### Review should check:

- Whether the content meets the requirements
- Whether the submission matches the task
- Whether the submission is complete
- Whether there are signs of copying or fraud
- Whether more edits are needed
- Whether it can be accepted immediately or must be returned
- Whether the submission file is valid
- Whether a file created from a URL matches the original content
- Whether the file has enough data for AI and reviewers to analyze

### Review outcomes can be:

- Approved
- Rejected
- Needs revision
- Needs more submission
- Escalated for manual check

### Goals of this step

- Ensure output quality
- Verify the submission
- Prevent fraud
- Create a feedback loop to improve contributors

## 8. Amplify

After a task is reviewed and accepted, the system can amplify the result.

Amplification turns a strong submission into a more valuable asset for the community or ecosystem.

### Amplification can include:

- Reposting content to other channels
- Sharing within the community
- Creating a summary thread
- Including it in a newsletter
- Adding it to an internal dashboard
- Saving it to the knowledge base
- Using it as a template for future tasks

### Goals of this step

- Increase the value of completed content
- Expand reach
- Reuse strong results
- Create a learning loop for the system

# Current Challenges

The current proposal mainly follows this workflow:

```
Claude
↓
Observe Telegram
↓
Draft a task
↓
Human approves
↓
Contributor completes the work
```

This approach works well as an AI assistant, but it lacks many properties required by an autonomous agent.

The current design is missing:

- Persistent memory
- Learning from history
- Evaluation loops
- Multi-step planning
- Knowledge accumulation
- Workflow intelligence
- Intermediate operating states after approval
- A mechanism for matching tasks with candidates by fit
- A mechanism for evaluating candidates after registration through Twitter and Telegram
- A mechanism for receiving structured submissions from users
- A mechanism for standardizing submissions into files before analysis
- A mechanism for verifying submissions before review
- Clearly defined route, claim, submit, and amplify mechanisms

In particular, the workflow does not yet clarify the operating chain after a task is approved. In practice, a task cannot go directly from Human approval to "done." It must pass through these steps:

- Route: route the task to the right group or contributor
- Claim: the contributor accepts the task
- Submit: the contributor submits the result
- Review: the reviewer checks quality and submission validity
- Amplify: amplify or distribute the result after approval

Without these states, the system will lack control over the task lifecycle, lack accountability transparency, and be difficult to scale into a true agentic workflow.

In addition, if tasks are not distributed to the right people, the system will face issues such as:

- Inconsistent output quality
- Overloaded reviewers
- Strong contributors not receiving suitable tasks
- Tasks being claimed by the wrong people or claimed too many times
- Workflow bottlenecks during review
- Sensitive tasks being assigned to people without enough trust

Without these capabilities, future automation will require very large architectural changes.

# Proposed System Architecture

The platform should be divided into three logical layers.

## Layer 1 — Communication Layer

Responsible for all user interaction.

Responsibilities include:

- Telegram Bot
- Notifications
- Sending tasks
- Human approval
- Contributor communication
- Displaying workflow states such as Signal / request, Reason & draft, Human approval, Route, Claim, Submit, Review, Amplify
- Collecting input signals from users
- Receiving new candidate registrations
- Connecting candidate Telegram and Twitter profiles
- Receiving submissions from users through the Telegram bot
- Standardizing submissions into structured data
- Confirming successful submission
- If a user sends a URL, calling the default API/tool to fetch content and convert it into a standardized file before passing it to the analysis layer

The Telegram bot in this layer should be built with Telegraf to take advantage of middleware, command routing, callback query handling, and clearly organized conversational flows.

### Candidate registration and evaluation in the communication layer

After a user registers, the system must trigger an onboarding flow to evaluate the candidate. This flow should collect and verify the following information:

- Telegram username
- Twitter handle
- Linkage between the two accounts
- Public activity level
- Initial trust signals
- Fit with the task types the system currently needs

### How to evaluate candidates through Twitter and Telegram

#### 1. Evaluation through Twitter

The system can consider:

- Account age
- Recent activity level
- Posting frequency
- Relevance to ecosystem topics
- Interaction quality
- Organic engagement rate
- Spam or bot signals
- Profile consistency

#### 2. Evaluation through Telegram

The system can consider:

- Valid username
- Activity level in relevant groups
- Response quality
- Response speed
- Interaction history in the system
- Spam signals or abnormal behavior
- Participation in valuable discussions

#### 3. Combining both signal sources

After a user registers, the system creates a candidate profile based on:

- Twitter score
- Telegram score
- Social trust score
- Registration status
- Verification status
- Risk flags

### Candidate evaluation data must be standardized

Each candidate should be stored as a structured object, for example:

- Candidate ID
- Telegram username
- Twitter handle
- Registration timestamp
- Verification status
- Twitter score
- Telegram score
- Social trust score
- Risk flags
- Skill tags
- Preferred task categories
- Eligibility tier
- Last evaluation timestamp

### Supported signal types

- Public Twitter profile
- Public Telegram profile or profile inside the system's groups
- Community interaction history
- Signals of real activity
- Spam or bot signals
- Task fit

The communication layer should not make all decisions on its own, but it must be the front line for collecting candidate data consistently and structurally.

## Layer 2 — Workflow Layer

Acts as the operating core of the platform.

Responsibilities include:

- Managing the task lifecycle
- Assignment flow
- Contributor permissions
- Review process
- Reputation tracking
- Reward management
- Workflow state transitions
- Coordinating post-approval steps: Route → Claim → Submit → Review → Amplify
- Checking claim validity
- Limiting the number of tasks a candidate can hold at the same time
- Checking whether a submission is complete
- Checking whether a submission matches the task
- Marking missing, incorrect, suspicious, or insufficient submissions
- Rejecting duplicate submissions or submissions without verification value
- Triggering candidate evaluation after registration
- Assigning initial trust levels to candidates based on Twitter and Telegram
- Managing submission standardization into files before passing them to the AI layer

This layer represents MultiAgency's business rules.

### Handling registration and candidate evaluation in the workflow

After a user registers, the workflow should not allow the user to claim tasks immediately. Instead, the system needs to:

- Record the registration
- Require Twitter and Telegram linkage
- Verify ownership or profile validity
- Score the candidate
- Assign an initial trust level
- Only route suitable tasks after the candidate reaches a minimum threshold

### Handling submissions in the workflow

After a user submits a result, the system should not treat the task as complete immediately. Instead, the workflow must check the submission during the Submit and Review steps.

For example:

- User completes the task
- User sends a submission
- User attaches the submission
- Workflow checks the submission
- If the submission is valid, the task moves to review
- If the submission is invalid, the task is returned or more information is requested

### Submission verification rules

- Submission must match the task ID
- Submission must be sent by the correct contributor
- Submission must have a valid timestamp
- Submission must match the required type
- Submission must contain enough information for reviewers to check
- Submission must not duplicate an older submission
- Submissions with signs of editing must be flagged
- Bulk submissions with identical content must be marked abnormal
- Submissions without a clear link to the task must be rejected
- If a submission comes from a URL, the generated file must be stored with source metadata for comparison

## Layer 3 — Intelligence Layer

The intelligence layer is responsible for reasoning rather than communication.

Responsibilities include:

- Observing ecosystem activity
- Detecting opportunities
- Prioritizing signals
- Planning campaigns
- Creating task proposals
- Matching contributors
- Learning from previous results
- Recommending routing logic for tasks
- Recommending amplification strategies after review
- Evaluating fit between tasks and candidates
- Evaluating submission validity
- Detecting abnormal, duplicate, or suspicious submissions
- Learning from abnormal patterns to improve filters in the communication layer
- Analyzing signals from Twitter and Telegram after a user registers
- Creating initial trust profiles for candidates
- Analyzing standardized submission files instead of raw URLs

This layer should communicate with the workflow engine rather than directly with Telegram.

### Abnormality and submission evaluation

The intelligence layer can score based on multiple signals:

- Abnormal message frequency
- Repeated content
- Missing identity information
- Bulk claim behavior
- History of low-quality submissions
- Bot-like or copy-paste language patterns
- Abnormal interaction level compared with the profile
- Submission does not match the task
- Submission shows signs of forgery or reuse
- Submission is sent multiple times with the same content
- Submission has a valid structure but no real verification value
- Twitter and Telegram profiles are inconsistent
- Signs of artificial social media activity
- File generated from a URL does not match the original source

Evaluation results can be used to:

- Automatically reduce priority
- Escalate to manual review
- Flag for model retraining
- Adjust contributor trust level
- Adjust candidate eligibility tier

# Overall Architecture

```
Twitter
Discord
Telegram
GitHub
News
NEAR ecosystem
        │
        ▼
Signal Collector
        │
        ▼
Agent Memory
        │
        ▼
Reasoning Engine
        │
        ▼
Task Planning Engine
        │
        ▼
Workflow Engine
        │
        ▼
Telegraf Telegram Interface
```

This architecture allows Telegram to be replaced by any future interface such as Slack, Discord, or a web dashboard.

# Core Data Model

## Contributor

Each contributor should have a persistent profile including:

- Telegram account
- Twitter account
- Wallet address
- Skills
- Role
- Reputation score
- Quality metrics
- Completion history
- Preferred task categories
- Ability to receive tasks by workflow type
- Failed claim rate
- Number of valid submissions
- Fit level for each task type
- History of valid submissions
- History of rejected or flagged submissions
- Twitter score
- Telegram score
- Social trust score
- Registration status
- Verification status
- Eligibility tier

## Task

Each task should include:

- Creator (Agent or Human)
- Category
- Required skills
- Reference materials
- Definition of Done
- Reward
- Deadline
- Workflow state
- Routing state
- Claim state
- Submission state
- Review state
- Amplification state
- Priority level
- Best-fit candidate profile
- Required submission type
- List of valid submissions
- Submission verification status
- Submission file metadata if there is a source URL

Recommended task lifecycle:

```
Signal / Request
↓
Reason & Draft
↓
Human Approval
↓
Route
↓
Claim
↓
Submit
↓
Review
↓
Amplify
↓
Completed
```

This state chain addresses the operating gap in the current workflow. It lets the system know where each task is, who is responsible, when review is needed, when submission is needed, and when content is ready to be amplified to the community.

## Agent Memory

Persistent memory is essential for long-term improvement.

Example record:

Signal

```
New NEAR AI product launch
```

Agent decision

```
Create an educational Twitter thread
```

Human feedback

```
Approved
```

Result

```
High engagement
```

Over time, the agent will build organizational knowledge instead of repeating the same reasoning patterns.

# Intelligent Task Creation

Task creation should happen in two stages.

## Stage 1 — Signal Detection

The agent continuously monitors ecosystem events.

Each signal is scored against criteria such as:

- Importance
- Timeliness
- Community relevance
- Strategic value
- Source credibility
- Noise risk

If the total score exceeds a configurable threshold, the agent moves to the planning step.

## Stage 2 — Task Planning

Instead of creating a single isolated task, the agent should build a coordinated task graph.

Example:

```
Product launch
├── Twitter Thread
├── Announcement post
├── Video
├── Research summary
└── Community distribution
```

This allows coordinated campaigns instead of fragmented pieces of work.

# Matching Tasks to Candidates

This is one of the most important parts of the system.

The bot should not distribute tasks randomly or by first come, first served. Instead, the system needs a task-to-candidate matching mechanism based on multiple criteria.

## Task-to-candidate matching criteria

- Skill fit: whether the candidate has the required skills
- Prior experience: whether the candidate has done similar tasks before
- Reputation score: how trustworthy the candidate is
- Completion speed: whether the candidate can deliver on time
- Output quality: whether previous submissions were good
- Availability: whether the candidate is free
- Personal preference: whether the candidate likes this task type
- Risk level: whether the task requires a highly trusted person
- Claim and submit history: whether the candidate works reliably
- Context fit: whether this task fits the current profile
- Twitter evaluation result: whether the public profile is trustworthy
- Telegram evaluation result: whether activity and interaction level are suitable

## Recommended distribution method

The system can use a composite score:

```
Match Score =
30% Skill Fit +
20% Reputation +
15% Past Performance +
15% Social Trust (Twitter + Telegram) +
10% Availability +
10% Preference
```

The candidate with the highest score should be prioritized for task routing.

## Distribution strategies

### 1. Priority-based distribution

Important tasks are sent to the highest-reputation candidates.

### 2. Expertise-based distribution

Technical tasks are only routed to people with matching technical skills.

### 3. Workload-based distribution

If a candidate is holding too many tasks, the system routes the task to someone else.

### 4. Trust-based distribution

Sensitive or high-value tasks are only assigned to trusted groups.

### 5. Trial-based distribution

Small tasks can be used to evaluate new candidates before assigning larger tasks.

## Mechanisms to avoid incorrect routing

- Do not route tasks to people with a high failed-claim history
- Do not route complex tasks to new contributors before they have enough trust
- Do not route urgent tasks to overloaded people
- Do not route sensitive tasks to unverified people
- Do not route duplicate tasks to multiple people unless necessary
- Do not route tasks to candidates with very low Twitter or Telegram scores
- Do not route tasks to candidates with spam signals or abnormal behavior

# Candidate Evaluation After Registration

This is mandatory if the system is expected to operate in a controlled way and scale later.

## Design principle

After a user registers, the system should not allow them to receive tasks immediately. Instead, there must be a candidate evaluation process based on Twitter and Telegram signals to determine initial fit.

## Recommended process

### 1. Registration

The user registers through the Telegram bot.

### 2. Profile linking

The user provides:

- Telegram username
- Twitter handle
- Additional information if needed

### 3. Verification

The system checks:

- Whether the account exists
- Whether the profile is public
- Whether the two accounts are consistent
- Whether there are signs of impersonation

### 4. Scoring

The agent scores the candidate based on:

- Twitter score
- Telegram score
- Social trust score
- Fit with task types
- Risk level

### 5. Trust assignment

The candidate is assigned a level such as:

- New
- Verified
- Trusted
- High-trust
- Restricted

### 6. Task eligibility activation

Only candidates who meet the minimum threshold are routed suitable tasks.

## Evaluation signals from Twitter

- Account age
- Recent activity level
- Posting frequency
- Interaction quality
- Ecosystem relevance
- Spam or bot signals
- Profile consistency

## Evaluation signals from Telegram

- Valid username
- Activity level in relevant groups
- Response quality
- Response speed
- Interaction history in the system
- Spam signals or abnormal behavior
- Participation in valuable discussions

## Output

After evaluation, the system stores:

- Candidate profile
- Eligibility tier
- Risk flags
- Social trust score
- Skill tags
- Preferred task categories

# How Can Users Submit Work?

This is a required part of the workflow if the system is expected to operate clearly and scale.

## Design principle

Users must have a simple, consistent, structured way to submit work after completing a task. A submission should not be just a free-form message. It must be linked to the correct task and contributor.

More importantly, submissions must be standardized as files. If a user sends a URL, the system uses a default API/tool to fetch content from the URL, create a standardized file, and pass that file to AI and reviewers. This way, AI only needs to analyze the file, not the raw URL.

## Ways users can submit work

### 1. Submit by command

Example:

```
/submit
```

The bot responds:

- Which task do you want to submit for?
- What type of submission is it?
- Do you want to attach a file, link, or text?

If the user selects a link or URL, the bot automatically calls the default tool to convert the URL into a standardized file.

### 2. Submit with buttons

The bot can display buttons:

- Submit submission
- Attach screenshot
- Attach link
- Attach file
- Attach transaction hash
- Attach GitHub PR

If the user selects Attach link, the system processes the URL through the default API/tool and stores the result as a file.

### 3. Submit by replying to the task message

The user only needs to reply to the task message and attach the corresponding submission.

### 4. Submit through a conversational form

The bot guides the user step by step:

- Select task
- Select submission type
- Send submission content
- Confirm
- Submit

## Supported submission types

- Screenshot
- Video
- Attachment
- Post link
- GitHub PR / commit link
- Transaction hash
- Text confirmation
- Structured metadata
- Source URL, then converted into a standardized file by the default tool

## Submission data to store

Each submission should be stored as a structured object:

- Task ID
- Contributor ID
- Submission type
- Submission content
- File URL or storage reference
- Timestamp
- Hash if any
- Verification status
- Reviewer notes
- Abnormality or duplicate flags
- Submission trust level
- Original source URL if the submission was created from a URL
- Standardized file metadata

## Submission processing workflow

- User completes the task
- User sends a submission
- User attaches the submission
- Bot confirms the submission was received
- If the submission is a URL, the system calls the default API/tool to convert the URL into a file
- Workflow checks whether the submission is valid
- If valid, the task moves to review
- If invalid, the user is asked to add more information or the task is returned

## Submission verification rules

- Submission must match the task ID
- Submission must be sent by the correct contributor
- Submission must have a valid timestamp
- Submission must match the required type
- Submission must contain enough information for reviewers to check
- Submission must not duplicate an old submission
- Submissions with signs of editing must be flagged
- Bulk submissions with identical content must be marked abnormal
- Submissions without a clear link to the task must be rejected
- Files generated from URLs must include source metadata for comparison
- AI only analyzes standardized files, not raw URLs

# Contributor Reputation

Contributor quality should be measured across multiple dimensions rather than only by acceptance rate.

Recommended scoring model:

- 40% Accepted task rate
- 20% Completion speed
- 20% Reviewer rating
- 10% Community impact
- 10% Consistency

This improves contributor matching accuracy over time.

In addition, the system should have operational metrics such as:

- Claim-without-submit rate
- Rejected submission rate
- Duplicate content rate
- Bulk claim rate
- Rule violation rate
- Invalid submission rate
- Additional-submission-request rate
- Reused submission rate
- Rate of candidates with low Twitter score
- Rate of candidates with low Telegram score

# Reward Recommendation

The agent should recommend a reward range rather than make payment decisions itself.

Example:

```
Estimated effort
6 hours
Typical market value
$100–$200
Recommended reward
$150
```

The final decision should still belong to the reviewer.

# Responsibility Split Between Humans and the Agent

## Version 1

Human responsibilities

- Approve signals
- Approve tasks
- Approve rewards
- Final acceptance
- Control Route, Claim, Submit, Review, and Amplify steps when needed
- Handle abnormal cases
- Verify submissions in sensitive cases
- Intervene when submissions are suspected to be irrelevant, forged, or insufficient
- Confirm candidate profiles after registration if needed

Agent responsibilities

- Detect signals
- Create drafts
- Recommend contributors
- Summarize
- Provide recommendations
- Recommend routing
- Recommend amplification timing
- Score candidate fit
- Preliminary submission checking
- Detect abnormal submissions in the communication layer
- Perform preliminary candidate evaluation through Twitter and Telegram after registration
- Convert URLs into standardized files before analysis

## Version 2

The agent can automatically execute low-risk workflows such as:

- Content summarization
- Translation
- Social reposting
- Metadata tagging
- Routine coordination
- Automatic routing for low-risk tasks
- Automatic amplification for pre-approved content
- Automatic handling of simple, clearly structured submissions
- Basic automatic scoring of new candidates based on Twitter and Telegram
- Automatic URL-to-file standardization for analysis

Humans still approve higher-impact work.

## Version 3

The platform evolves into a complete coordination system capable of:

- Campaign planning
- Contributor coordination
- Reward optimization
- Outcome measurement
- Continuous improvement through feedback
- Higher-level automation of routing, claiming, review, and amplification
- Learning how to optimize task distribution over time
- Automatically handling submissions according to learned rules
- Automatically upgrading or downgrading candidate trust levels based on Twitter and Telegram behavior
- Automatically standardizing all URL submissions into files before AI analysis

# Technical Stack

## Backend

- Node.js
- TypeScript
- PostgreSQL
- Redis

## AI Layer

- NEAR AI Cloud
- Claude

Agent tools:

- Database access
- Contributor matching
- Analysis
- Task generation
- Workflow execution
- Route recommendation
- Review evaluation
- Amplification recommendation
- Candidate fit scoring
- Submission checking
- Candidate Twitter and Telegram profile evaluation
- Calling the default API/tool to convert URLs into standardized files

## Telegram Bot Framework

- Telegraf

Telegraf will be used to build the Telegram bot in the communication layer, including:

- Command handling
- Callback query handling
- Middleware management
- Conversation routing
- Integration with the workflow engine and AI layer
- Coordination of claim, submit, and candidate onboarding flows

Using Telegraf gives the Telegram bot a clearer structure than a manual implementation and makes it easier to extend when new interaction flows are needed.

## Agent Framework

Recommended architecture:

LangGraph-style orchestration

Reasons:

- Clear workflow state
- Memory support
- Human checkpoints
- Flexible tool execution
- Clear separation between reasoning and execution
- Easy representation of Signal / request → Reason & draft → Human approval → Route → Claim → Submit → Review → Amplify states
- Easy insertion of candidate matching checks
- Easy insertion of submission verification steps
- Easy insertion of candidate evaluation after registration through Twitter and Telegram
- Easy insertion of URL-to-file standardization before AI analysis

Alternative implementations with a state machine or custom orchestration are also viable, as long as this separation of responsibilities is preserved.

# Risks

## Overdependence on Telegram

Telegram should remain the communication interface rather than becoming the execution layer of the platform.

Telegraf is only the framework for implementing the Telegram bot cleanly and structurally. It should not make all business logic dependent on Telegram.

## Missing feedback loop

Each completed task should generate structured feedback.

```
Signal
↓
Task
↓
Execution
↓
Submission
↓
Publishing
↓
Performance
↓
Learning
```

Without this loop, the agent cannot improve over time.

## Missing task ontology

Tasks should be classified using a shared ontology.

Example categories:

Content

- Tweet
- Thread
- Video
- Article
- Meme
- Translation

Research

- Market analysis
- Competitor research

Community

- Event
- Outreach
- Moderation

A consistent ontology improves planning, contributor matching, and analysis.

## Workflow does not yet clarify post-approval operating steps

This is an important risk that must be addressed from Version 1.

If the workflow stops at "Human approval" without following steps such as Route, Claim, Submit, Review, and Amplify, the system will face the following problems:

- It will not know who the task was sent to
- It will not know who is responsible for execution
- There will be no control point at submission
- There will be no clear review mechanism
- There will be no amplification step after completion
- There will be no way to standardize submissions from users
- There will be no way to standardize URLs into files before AI analysis

Therefore, the workflow engine must treat these as official task lifecycle states, not secondary steps.

## Submissions are not standardized

If submissions are sent only as free-form messages, the system will quickly encounter problems:

- Difficult verification
- Difficult storage
- Difficult comparison with tasks
- Difficult review automation
- Difficult long-term contributor quality evaluation

This is why the bot must support structured submissions from the beginning, and every URL must be converted into a standardized file before AI processing.

## Incorrect task-to-candidate distribution

Without a good matching mechanism, the system will face problems such as:

- Tasks assigned to people without enough skill
- Reviewers needing to fix too much
- Strong contributors being overlooked
- Sensitive tasks assigned to the wrong people
- Overall performance declining

This is why the intelligence layer must participate in matching tasks with candidates.

## Candidate evaluation through Twitter and Telegram lacks standardization

Without a clear evaluation process after user registration, the system may face problems such as:

- Fake candidates being accepted too easily
- Inconsistent profiles between Twitter and Telegram
- Inability to distinguish real users from spam accounts
- No initial trust level for task routing
- Important tasks being assigned to candidates without enough credibility

Therefore, candidate evaluation through Twitter and Telegram must be standardized as an official onboarding step.

# Implementation Roadmap

## Stage 1 — Coordination Foundation

- Telegram Bot with Telegraf
- Workflow Engine
- Contributor database
- Human approval
- Basic AI for task drafting
- Clear workflow states: Signal / request → Reason & draft → Human approval → Route → Claim → Submit → Review → Amplify
- Task-to-candidate matching with rule-based matching
- Candidate registration mechanism
- Candidate evaluation through Twitter and Telegram
- Basic submission mechanism through the bot
- Preliminary submission checking in the workflow layer
- File-based submission standardization
- Default tool for URL-to-file conversion

## Stage 2 — Intelligence Layer

- Signal collection
- Agent memory
- Task planning
- Contributor matching
- Reward estimation
- Routing and amplification recommendations
- Candidate fit scoring using historical data
- Basic automatic submission checking
- Detection of abnormal, duplicate, and suspicious submissions
- Deeper evaluation of candidate Twitter and Telegram profiles
- Analysis of standardized submission files instead of raw URLs

## Stage 3 — Automated Coordination

- Campaign planning
- Evaluation loop
- Performance analysis
- Workflow optimization
- Continuous learning
- Higher-level task distribution automation
- Automated verification for standardized submission types
- Automatic adjustment of candidate trust levels based on real behavior
- Automatic URL-to-file standardization before AI analysis

# Implementation Timeline

Below is the proposed timeline from MVP implementation to the first stable version. Estimated total time: 10 weeks (~2.5 months).

## Timeline overview

| Phase | Duration | Main objective | Deliverables |
| --- | --- | --- | --- |
| Phase 0 — Discovery & Design | 1 week | Finalize scope, architecture, data model, workflow states | PRD, TDD, schema, flow diagram |
| Phase 1 — Foundation | 2 weeks | Build the coordination foundation and Telegram bot | Telegraf bot, workflow engine, DB schema, task lifecycle |
| Phase 2 — Intelligence Layer | 2 weeks | Add reasoning, matching, memory, candidate scoring | Signal collector, agent memory, matching engine, candidate scoring |
| Phase 3 — Submission & Review Automation | 2 weeks | Standardize submissions, review pipeline, file conversion | Submit flow, URL-to-file tool, review queue, validation rules |
| Phase 4 — Hardening & Pilot Launch | 3 weeks | Testing, optimization, small-group pilot | QA, logging, monitoring, pilot rollout |

## Phase details

### Phase 0 — Discovery & Design (Week 1)

Goals:

- Finalize Version 1 scope
- Clearly define workflow states
- Design the data model for contributors, tasks, submissions, and candidate profiles
- Define rules for route, claim, submit, review, and amplify
- Finalize candidate evaluation through Twitter and Telegram
- Finalize file-based submission standardization

Expected outcomes:

- Complete PRD
- Technical Design Document
- Workflow diagram
- Database schema v1
- Initial API contract

### Phase 1 — Foundation (Weeks 2–3)

Goals:

- Build the Telegram bot with Telegraf
- Build the workflow engine for the task lifecycle
- Create basic task CRUD
- Create contributor profiles
- Create human approval flow
- Create basic route/claim flow
- Create initial submission framework

Expected outcomes:

- Telegram bot works
- Task lifecycle runs end to end at a basic level
- Human approval flow works
- Basic contributor onboarding works

### Phase 2 — Intelligence Layer (Weeks 4–5)

Goals:

- Build signal collector
- Build agent memory
- Build reasoning engine
- Build task planning engine
- Build task-to-candidate matching engine
- Build candidate scoring from Twitter and Telegram
- Build reward recommendation engine

Expected outcomes:

- Agent can recommend task drafts
- Agent can recommend suitable contributors
- Agent can score candidates initially
- Agent can store decision history for learning

### Phase 3 — Submission & Review Automation (Weeks 6–7)

Goals:

- Standardize submissions as files
- Build the default URL-to-file conversion tool
- Build submission validation
- Build review queue
- Build abnormal submission detection rules
- Build amplification mechanism after review

Expected outcomes:

- Users can submit through the bot in multiple ways
- URLs are converted into files before AI analysis
- Reviewers have a clear pipeline to check submissions
- Tasks can move through review and amplification structurally

### Phase 4 — Hardening & Pilot Launch (Weeks 8–10)

Goals:

- End-to-end testing
- Optimize bot UX
- Optimize matching rules
- Optimize scoring
- Set up logging, monitoring, and alerting
- Run a pilot with a small contributor group

Expected outcomes:

- System is stable enough for pilot
- Real data is available to refine scoring
- System can scale toward Version 2

# Estimated Budget

The budget below separates Product / Architecture / PM by phase and also includes monthly operating budget.

## Product / Architecture / PM Budget

| Phase | Product / Architecture / PM Budget |
| --- | --- |
| Phase 0 — Discovery & Design | $800 – $1,400 |
| Phase 1 — Foundation | $1,000 – $1,750 |
| Phase 2 — Intelligence Layer | $800 – $1,400 |
| Phase 3 — Submission & Review Automation | $800 – $1,400 |
| Phase 4 — Hardening & Pilot Launch | $600 – $1,050 |

Estimated total Product / Architecture / PM budget: $4,000 – $7,000

## Monthly Operating Budget

| Item | Estimate / month |
| --- | --- |
| Server / Database / Redis | $150 – $300 |
| LLM / AI API usage | $300 – $1,000 |
| Storage / File processing | $50 – $100 |
| Monitoring / Logging | $50 – $100 |
| Misc / Tooling | $50 – $100 |

Estimated operating cost: $600 – $1,600 / month

# Conclusion

The proposed system should not be viewed as a Telegram task bot.

Instead, it should be designed as the foundation for an Agentic Operating System capable of coordinating a distributed creative organization.

For Version 1, building the coordination "rails" during the first 10 weeks is the right approach. However, the architecture should include from the beginning the capabilities needed for future automation, including persistent memory, structured task planning, evaluation loops, contributor reputation, workflow intelligence, structured submission mechanisms, file-based submission standardization, a default URL-to-file conversion tool, and a candidate evaluation process after registration.

More importantly, the system must clearly answer four core questions:

How can tasks be distributed to suitable candidates?
By using a matching engine based on skills, reputation, completion history, availability, preferences, risk, and evaluation results from Twitter and Telegram.

How can users submit work?
By allowing users to submit through the Telegram bot using commands, buttons, direct replies, or conversational forms, then standardizing submissions into structured files so the workflow can verify and store them. If a user sends a URL, the system uses the default API/tool to convert the URL into a file, and AI only receives the file for analysis.

How should candidates be evaluated after registration?
By requiring Twitter and Telegram linkage, scoring public profiles, verifying consistency, assigning initial trust levels, and only allowing task assignment after candidates meet the required threshold.

How can the workflow reflect real operations after a task is approved?
By clearly defining Signal / request → Reason & draft → Human approval → Route → Claim → Submit → Review → Amplify as a core part of the task lifecycle.

By separating communication, workflow, and intelligence from the beginning, while using Telegraf to implement the Telegram bot at the communication layer, MultiAgency can evolve from an AI-assisted coordination platform into a true agentic operating system without redesigning the entire architecture.
