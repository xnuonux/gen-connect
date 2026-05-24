# gen voice corpus · placeholder

this file is a placeholder. the real voice corpus lives in `docs/voice-corpus.md` which is gitignored.

## the rules

1. NEVER commit `docs/voice-corpus.md` to git. it's personal training data for the drafting engine.
2. the corpus is the source of truth for "what does dom (or any user) sound like in cold outreach?"
3. NOVA press is compiling the master corpus for long-form. GEN inherits a derivative tuned for outreach: shorter, hookier, closer-instinct register.
4. minimum 10 samples to activate per-user voice match. below threshold, the drafter falls back to the dom voice prior baked into the system prompt.

## the structure

`docs/voice-corpus.md` (gitignored) should look like:

```markdown
# voice corpus

## sample 1
subject: quick one about your nashville drop
body:
saw you posted about the venue near east studio ... if you ever want to
test a tuesday slot there my room holds 200 and we just opened bookings
for q3. zero pressure, just felt like the kind of room your set would
land in.

## sample 2
subject: re: the new EP
body:
the bridge on track 4 is the move. wild.
i run bookings for a 200-cap room in chicago, would love to host you
when you're back through. tuesdays are open through fall.

...
```

10 samples minimum. 50 ideal.

## what the engine extracts

on save, claude sonnet 4.6 extracts:
- average sentence length + variance
- vocabulary idiosyncrasies (top 10 phrases the user reaches for)
- opening patterns (how they start cold)
- closing patterns (how they sign off)
- formality level 1-10
- punctuation habits (em-dashes, ellipses, exclamation use)
- avoided phrases
- emoji usage frequency

stored in `user_profiles.voice_profile_features` jsonb. fed into every drafting prompt as structured constraints alongside raw samples.

## the dom voice prior

baked into the drafting engine system prompt as a fallback. tuned for outreach: lowercase, no em-dashes, punchy, vulnerable-but-confident, the closer instinct. solo creator voice, not SDR voice.

## the re-extraction trigger

every 5 new samples or every 30 days, voice profile re-extracts. user is alerted in settings: "your voice profile tightened ... here's what changed."

## the drift detector

every 100 drafts, sample 5 at random, run through a sonnet 4.6 classifier: "does this sound like user X based on their voice profile?" if confidence drops below 0.7, alert: "your drafts may be drifting ... want to add more samples?"
