# Question Text Audit v8.2

## Summary

- Source: data/generated/questions.json
- Total questions scanned: 645
- Suspicious question count: 41

## Top Recurring Suspicious Patterns

- ` .`: 11
- ` ?`: 6
- `g stall`: 4
- ` ,`: 3
- `s pitch`: 3
- ` :`: 2
- `and s`: 2
- `s green`: 2
- `s person`: 2
- `s roll`: 2
- `                      .`: 1
- `accompanied b`: 1
- `accompanied b a`: 1
- `and c`: 1
- `and c are`: 1
- `bus n`: 1
- `of m or`: 1
- `s because`: 1
- `s BELOW`: 1
- `s control`: 1
- `s displays`: 1
- `s pitot`: 1
- `s respective`: 1
- `s seat`: 1
- `s very`: 1

## Examples By Pattern

### Known split-word artifacts

No examples found.

### Suspicious phrase: sid if

No examples found.

### Isolated plural s

- Question ID: 419
  - Field: question
  - Original: An aerodrome is considered "suitable" for operations, when in addition to the requirement in order to be "adequate", the weather report or forecast, or any combination thereof indicate the weather conditions are above the operating minima applicable and s
  - Cleaned preview: An aerodrome is considered "suitable" for operations, when in addition to the requirement in order to be "adequate", the weather report or forecast, or any combination thereof indicate the weather conditions are above the operating minima applicable and s

### Split single letter inside likely word

- Question ID: 321
  - Field: option_b
  - Original: An IMBAL indication below main tank N°1 accompanied b a Master Caution light and system annunciation for fuel
  - Cleaned preview: An IMBAL indication below main tank N°1 accompanied b a Master Caution light and system annunciation for fuel
- Question ID: 491
  - Field: question
  - Original: With visibility of m or less the LHS must be PF for landing:
  - Cleaned preview: With visibility of m or less the LHS must be PF for landing:
- Question ID: 537
  - Field: option_d
  - Original: Answer a and c are correct.
  - Cleaned preview: Answer a and c are correct.

### Leading single-letter split

- Question ID: 43
  - Field: option_b
  - Original: A bottled solutions located behind the Captain’s seat
  - Cleaned preview: A bottled solutions located behind the Captain's seat
- Question ID: 44
  - Field: option_b
  - Original: If it’s green; the cowl anti ice is closed and the related engine anti-ice switch is OFF
  - Cleaned preview: If it's green; the cowl anti ice is closed and the related engine anti-ice switch is OFF
- Question ID: 44
  - Field: option_c
  - Original: If it’s green; the cowl anti ice valve(s) is open
  - Cleaned preview: If it's green; the cowl anti ice valve(s) is open
- Question ID: 154
  - Field: option_c
  - Original: Either crew member to apply force against the jam to breakout the Captain’s control column only
  - Cleaned preview: Either crew member to apply force against the jam to breakout the Captain's control column only
- Question ID: 185
  - Field: option_b
  - Original: Both pilot’s displays are using the No.2 symbol generator
  - Cleaned preview: Both pilot's displays are using the No.2 symbol generator
- Question ID: 185
  - Field: option_d
  - Original: ADIRU inputs for both the left and right ADIRU are received from the FO’s pitot probe
  - Cleaned preview: ADIRU inputs for both the left and right ADIRU are received from the FO's pitot probe
- Question ID: 189
  - Field: option_b
  - Original: A presentation of aeroplane’s pitch attitude
  - Cleaned preview: A presentation of aeroplane's pitch attitude
- Question ID: 190
  - Field: question
  - Original: The navigation display’s wind arrow with wind direction/speed is:
  - Cleaned preview: The navigation display's wind arrow with wind direction/speed is:
- Question ID: 191
  - Field: option_c
  - Original: Captain’s roll attitude is more than 3° in error
  - Cleaned preview: Captain's roll attitude is more than 3° in error
- Question ID: 191
  - Field: option_d
  - Original: Captain’s and FO’s roll angle displays differ by more than 5°
  - Cleaned preview: Captain's and FO's roll angle displays differ by more than 5°
- Question ID: 192
  - Field: option_c
  - Original: Captain’s and FO’s pitch angle displays differ by more than 5°
  - Cleaned preview: Captain's and FO's pitch angle displays differ by more than 5°
- Question ID: 192
  - Field: option_d
  - Original: FO’s pitch displays more than 3° in error
  - Cleaned preview: FO's pitch displays more than 3° in error
- Question ID: 306
  - Field: option_b
  - Original: Push either pilot’s BELOW G/S P-EXTINGUISH light while in the alerting area
  - Cleaned preview: Push either pilot's BELOW G/S P-EXTINGUISH light while in the alerting area
- Question ID: 361
  - Field: question
  - Original: The refill indication (RF) is displayed adjacent to it’s respective hydraulic system quantity:
  - Cleaned preview: The refill indication (RF) is displayed adjacent to it's respective hydraulic system quantity:
- Question ID: 406
  - Field: option_a
  - Original: The normal all engine initial climb speed. Minimum V2 must be equal to or greater than 1.1 times the 1-g stall speed and 1.1 times Vmca
  - Cleaned preview: The normal all engine initial climb speed. Minimum V2 must be equal to or greater than 1.1 times the 1-g stall speed and 1.1 times Vmca

### Trailing single-letter split

- Question ID: 1
  - Field: option_b
  - Original: The ARMED position illuminates all emergency lights if AC bus n°1 fails
  - Cleaned preview: The ARMED position illuminates all emergency lights if AC bus n°1 fails
- Question ID: 321
  - Field: option_b
  - Original: An IMBAL indication below main tank N°1 accompanied b a Master Caution light and system annunciation for fuel
  - Cleaned preview: An IMBAL indication below main tank N°1 accompanied b a Master Caution light and system annunciation for fuel
- Question ID: 419
  - Field: question
  - Original: An aerodrome is considered "suitable" for operations, when in addition to the requirement in order to be "adequate", the weather report or forecast, or any combination thereof indicate the weather conditions are above the operating minima applicable and s
  - Cleaned preview: An aerodrome is considered "suitable" for operations, when in addition to the requirement in order to be "adequate", the weather report or forecast, or any combination thereof indicate the weather conditions are above the operating minima applicable and s
- Question ID: 537
  - Field: option_d
  - Original: Answer a and c are correct.
  - Cleaned preview: Answer a and c are correct.

### Repeated spaces

No examples found.

### Spaces before punctuation

- Question ID: 5
  - Field: question
  - Original: At what cabin altitude is the passenger oxygen system automatically activated ?
  - Cleaned preview: At what cabin altitude is the passenger oxygen system automatically activated?
- Question ID: 17
  - Field: question
  - Original: A Cabin Attendant reports that there is a paper fire in the cabin. Which type of fire extinguisher be used on the fire ?
  - Cleaned preview: A Cabin Attendant reports that there is a paper fire in the cabin. Which type of fire extinguisher be used on the fire?
- Question ID: 24
  - Field: question
  - Original: The Cabin Pressurization Panel MANUAL green light is illuminated, what does this indicate ?
  - Cleaned preview: The Cabin Pressurization Panel MANUAL green light is illuminated, what does this indicate?
- Question ID: 42
  - Field: question
  - Original: Illumination of the amber BLEED TRIP OFF light indicates what valve has automatically closed ?
  - Cleaned preview: Illumination of the amber BLEED TRIP OFF light indicates what valve has automatically closed?
- Question ID: 152
  - Field: option_c
  - Original: With flaps extended .20 to 16.9 units
  - Cleaned preview: With flaps extended .20 to 16.9 units
- Question ID: 152
  - Field: option_d
  - Original: With flaps extended .50 to 14.5 units
  - Cleaned preview: With flaps extended .50 to 14.5 units
- Question ID: 179
  - Field: option_a
  - Original: Provides stability at mach numbers above .615
  - Cleaned preview: Provides stability at mach numbers above .615
- Question ID: 275
  - Field: question
  - Original: An entry of .720 for descend into the TGT SPD line on the ACT ECON SPD DES page will:
  - Cleaned preview: An entry of .720 for descend into the TGT SPD line on the ACT ECON SPD DES page will:
- Question ID: 444
  - Field: question
  - Original: The circling is designated to provide a terrain clearance of at least              above the highest spot elevation within from the runway threshold :
  - Cleaned preview: The circling is designated to provide a terrain clearance of at least              above the highest spot elevation within from the runway threshold:
- Question ID: 505
  - Field: option_a
  - Original: Special Banks where deposits can give high interest rates .
  - Cleaned preview: Special Banks where deposits can give high interest rates.
- Question ID: 535
  - Field: question
  - Original: What is a POC ?
  - Cleaned preview: What is a POC?
- Question ID: 536
  - Field: question
  - Original: Which kind of permission is required for the Carriage of weapons , munitions of war?
  - Cleaned preview: Which kind of permission is required for the Carriage of weapons, munitions of war?
- Question ID: 537
  - Field: option_a
  - Original: Only if he/she is a Police member .
  - Cleaned preview: Only if he/she is a Police member.
- Question ID: 548
  - Field: question
  - Original: The phrase “Attention: Crew on Station!” means: 1) Go to assigned CA stations immediately. 2) Show increased attention. 3)                      . 4) Wait further commands. Select the correct statement for the point 3::
  - Cleaned preview: The phrase "Attention: Crew on Station! " means: 1) Go to assigned CA stations immediately. 2) Show increased attention. 3). 4) Wait further commands. Select the correct statement for the point 3: :
- Question ID: 551
  - Field: option_b
  - Original: Take a flashlight, open door 1R (if not yet opened) leave the aeroplane through door 1R, move the passenger away from the aeroplane ,give assistance
  - Cleaned preview: Take a flashlight, open door 1R (if not yet opened) leave the aeroplane through door 1R, move the passenger away from the aeroplane, give assistance

## Recommendation

Review recurring patterns, add precise dictionary words or phrase corrections only when the joined result is unambiguous, and keep corrections display-only unless source data is intentionally migrated later.

