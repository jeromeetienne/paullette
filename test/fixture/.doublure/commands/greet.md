---
description: Greet a person by name, using the project note and the folder listing
argument-hint: [name]
allowed-tools: Bash(ls:*)
---

Say hello to $ARGUMENTS in the greeting style of this project.

The files in this folder are: !`ls`

The project note says: @secret_note.txt
