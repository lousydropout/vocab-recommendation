# Essay Generation Workflow

## Process for Each Prompt

When a prompt is provided, follow these steps:

### 1. Record the Prompt
- Add an entry to `memory-bank/prompts.json` with:
  - `id`: Unique identifier (sequential number)
  - `prompt_text`: The exact prompt text
  - `created_date`: Date in YYYY-MM-DD format
  - `essay_directory`: Path to the directory where essays are stored

### 2. Create Essay Directory
- Generate a new directory to house all student essays for this prompt
- Directory naming convention: `essays/prompt_<id>_<date>/` or similar
- This directory will contain all 15 student essays

### 3. Generate Essays
- Generate essays for all 15 personas from `student_personas.json`
- **Process**: Generate essays one at a time, review each essay for consistency with the persona, and wait for approval before continuing to the next student
- Each essay should reflect the persona's:
  - Personality traits
  - Interests
  - Writing quirks
  - Academic strengths/weaknesses
- After generating each essay:
  - Check word count matches target (use `wc -w` command)
  - Verify all persona-specific guidelines are followed
  - **Verify 7th-grade voice**: Ensure the essay sounds authentically written by a 7th grader (12-13 years old)
    - Avoid overly mature or sophisticated phrasing that sounds like an adult wrote it
    - Use age-appropriate language and sentence structures
    - Even students with "above average" vocabulary should sound like a middle schooler using bigger words, not an adult
    - Examples of phrases to avoid: "I remember the way he smelled, like fabric softener" (too descriptive/poetic), "I was so attached to this piece of fabric and stuffing" (too analytical/detached)
    - Prefer more direct, simpler phrasing: "He smelled like fabric softener" or "I was really attached to this stuffed animal"
    - The essay should feel genuine to a 7th grader's voice, even if the student has strong writing skills
  - Record thesis statement in `memory-bank/thesis_statements.json`

#### Essay Structure Rules (Default)
1. **Five-paragraph format:**
   - Paragraph 1: Introduction (3-5 sentences)
   - Paragraph 2: Body point #1 (4-7 sentences)
   - Paragraph 3: Body point #2 (4-7 sentences)
   - Paragraph 4: Body point #3 (4-7 sentences)
   - Paragraph 5: Conclusion (3-5 sentences)

2. **Paragraph separation:** Blank line between paragraphs

3. **Persona flexibility:**
   - Allow persona traits to shape structure naturally (shorter/longer paragraphs, run-ons, etc.)
   - Apply quirks within paragraphs without breaking paragraph count
   - Only bend structure if it fits the persona (e.g., disorganized, easily distracted, class clown)
   - Final output should still look like a standard middle-school essay

4. **Thesis tracking:** Note each essay's thesis statement (or "no thesis statement") in `memory-bank/thesis_statements.json`

#### Grammar and Spelling Guidelines
When a student's persona indicates a weakness in grammar or spelling (e.g., "weak_subject": "English grammar"), incorporate realistic mistakes that a 7th grader would make:

1. **Comma errors:**
   - Comma splices: "I went to the store, I bought milk" (should use semicolon or "and")
   - Missing commas in compound sentences: "I went there but I didn't see him" (needs comma before "but")
   - Missing commas after introductory phrases: "Now if I lose something I just deal with it" (needs comma after "something")

2. **Homophone confusion:**
   - there/their/they're: "see there stuff" (should be "their"), "when there were little" (should be "they were")
   - your/you're: "your going to love it" (should be "you're")
   - its/it's: "its a good idea" (should be "it's")
   - to/too/two: "I want to go to" (context-dependent)

3. **Colloquial usage mistakes:**
   - "would of" instead of "would have" or "would've": "I would of had meltdowns" (should be "would have had")
   - "could of" instead of "could have": "I could of done it" (should be "could have done")
   - "should of" instead of "should have": "I should of known" (should be "should have known")

4. **Other common 7th-grade mistakes:**
   - Subject-verb agreement issues (less common but can appear)
   - Run-on sentences (see run-on sentence guidelines below)
   - Inconsistent verb tenses

**Important:** Don't overdo it. Include 2-4 subtle mistakes throughout the essay that feel natural and don't completely derail readability. The essay should still sound like the student's voice, just with grammar weaknesses showing through.

#### Run-On Sentence Guidelines
Some students naturally write run-on sentences based on their personality and writing quirks. See `memory-bank/student_writing_guidelines.json` for specific frequencies:

- **Chloe Martinez**: Frequent (2-4 per essay) - explicitly has "run-on sentences" in quirks
- **Marcus Johnson**: Occasional (2-3 per essay) - messy structure, high-energy
- **Aria Hassan**: Occasional (1-2 per essay) - long winding sentences, overexplains
- **Ava Kim**: Rare (0-1 per essay) - easily distracted, may drift into run-ons
- **All others**: None (0 per essay) - maintain sentence structure

#### Word Count Guidelines
Essay lengths will range 250-600 words. Each student has a target word count with a 20% margin of error. See `memory-bank/student_writing_guidelines.json` for specific targets:

- **Longer essays (470-600 words)**: Ava Kim, Chloe Martinez, Aria Hassan, Sofia López, Ethan Greene, Dylan Cooper, Henry Walsh
- **Average essays (300-500 words)**: Maya Thompson, Noah Patel, Emily Nguyen, Natalie Reyes
- **Shorter essays (250-400 words)**: Liam Rodriguez, Zoe Carter, Jackson Brooks
- **Variable (300-550 words)**: Marcus Johnson (messy structure causes wide variation)

When generating, aim for the target ±20% to stay within the expected range while reflecting each student's natural writing style.

#### Vocabulary Guidelines
Each student has different vocabulary knowledge and usage preferences. See `memory-bank/student_writing_guidelines.json` for specific details:

**Vocabulary Size Categories:**
- **Extensive**: Emily Nguyen, Henry Walsh, Aria Hassan
- **Above Average**: Maya Thompson, Ava Kim, Ethan Greene, Zoe Carter, Jackson Brooks, Dylan Cooper
- **Above Average (Technical)**: Noah Patel
- **Average**: Liam Rodriguez, Marcus Johnson, Sofia López, Natalie Reyes
- **Average to Above**: Chloe Martinez

**Vocabulary Usage Preferences:**
- **Show off with misuse**: Chloe Martinez (tries big words, misuses 1-2 per essay)
- **Formal show off**: Henry Walsh (extensive vocab, defines terms, loves demonstrating knowledge)
- **Careful use**: Maya Thompson, Ethan Greene (know good vocab but use thoughtfully, don't show off)
- **Natural use**: Liam Rodriguez, Ava Kim (flowery), Aria Hassan (technical), Dylan Cooper (elaborate)
- **Safe avoidance**: Emily Nguyen (knows extensive vocab but uses simpler words to avoid mistakes)
- **Misuse when creative**: Noah Patel (technical vocab strong, misuses creative/descriptive words)
- **Use with spelling errors**: Zoe Carter (knows good vocab but misspells bigger words 1-2 per essay)
- **Casual/simple**: Marcus Johnson, Sofia López, Natalie Reyes (average vocab, keep it simple)
- **Effective edgy use**: Jackson Brooks (good vocab, chooses words for dramatic/edgy effect)

When generating essays, match vocabulary choices to each student's size and preference. For students who misuse words or have spelling errors, include 1-2 instances naturally throughout the essay.

### 4. Save Essays
- File format: `.txt` documents
- File naming: `<last name>_<first name>.txt` (e.g., `Thompson_Maya.txt`, `Rodriguez_Liam.txt`)
- Essay content format:
  ```
  <FirstName> <LastName>
  <SubmissionDate in MM/DD/YYYY format>
  
  <Title> (optional)

  <EssayBody>
  ```

## File Structure
- `memory-bank/student_personas.json`: Contains all 15 student personas (DO NOT MODIFY unless explicitly instructed)
- `memory-bank/prompts.json`: Tracks all prompts and their associated directories
- `essays/prompt_<id>_<date>/`: Directory containing all essays for a specific prompt

