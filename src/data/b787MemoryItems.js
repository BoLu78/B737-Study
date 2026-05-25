const B787_MEMORY_DIAGRAM_BASE_PATH = `${import.meta.env?.BASE_URL || '/B737-Study/'}assets/memory-items/diagrams/b787`

export const B787_MEMORY_ITEMS = [
  {
    id: 'b787-aborted-engine-start-l-r',
    aircraft: ['b787'],
    title: 'Aborted Engine Start L, R',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: ['On the ground, an aborted engine start is needed.'],
    steps: [
      {
        number: '1',
        left: 'FUEL CONTROL switch (affected side)',
        right: 'CUTOFF',
      },
    ],
  },
  {
    id: 'b787-airspeed-unreliable',
    aircraft: ['b787'],
    title: '[] AIRSPEED UNRELIABLE',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: ['The airspeed or Mach indications disagree with AOA calculated airspeed.'],
    objectives: ['To identify a reliable airspeed indication.'],
    steps: [
      {
        number: '1',
        left: 'Autopilot disconnect switch',
        right: 'Push',
      },
      {
        number: '2',
        left: 'A/T ARM switches (both)',
        right: 'OFF',
      },
      {
        number: '3',
        left: 'F/D switches (both)',
        right: 'OFF',
      },
      {
        number: '4',
        left: 'Set the following gear up pitch attitude and thrust',
        right: '',
        substeps: [
          {
            left: 'Flaps extended',
            right: '10° and 85% N1',
          },
          {
            left: 'Flaps up',
            right: '4° and 70% N1',
          },
        ],
      },
    ],
  },
  {
    id: 'b787-cabin-altitude',
    aircraft: ['b787'],
    title: '[] CABIN ALTITUDE',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: ['Cabin altitude is excessive.'],
    visualAids: [
      {
        title: 'Emergency Descent',
        imageSrc: `${B787_MEMORY_DIAGRAM_BASE_PATH}/b787-emergency-descent.png`,
        description: 'B787 emergency descent maneuver flow.',
        alt: 'B787 Emergency Descent maneuver flow',
      },
    ],
    steps: [
      {
        number: '1',
        left: 'Don the oxygen masks.',
        right: '',
      },
      {
        number: '2',
        left: 'Establish crew communications.',
        right: '',
      },
      {
        number: '3',
        left: 'Check the cabin altitude and rate.',
        right: '',
      },
      {
        number: '4',
        left: 'If the cabin altitude is uncontrollable:',
        right: '',
        emphasis: ['If'],
        substeps: [
          {
            left: 'PASS OXYGEN switch',
            right: 'Push to ON and hold for 1 second',
          },
          {
            left: 'Without delay, descend to the lowest safe altitude or 10,000 feet, whichever is higher.',
            right: '',
            emphasis: ['Without delay,'],
          },
          {
            type: 'bullet-list',
            label: 'To descend:',
            bullets: [
              'Move the thrust levers to idle',
              'Extend the speedbrakes',
              'If structural integrity is in doubt, limit airspeed and avoid high maneuvering loads',
              'Descend at Vmo/Mmo',
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'b787-dual-eng-fail-stall',
    aircraft: ['b787'],
    title: 'Dual Eng Fail/Stall',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: ['Engine speed for both engines is below idle.'],
    visualAids: [
      {
        title: 'Drift Down',
        imageSrc: `${B787_MEMORY_DIAGRAM_BASE_PATH}/b787-drift-down.png`,
        description: 'B787 drift down / engine out cruise flow.',
        alt: 'B787 Drift Down maneuver flow',
      },
    ],
    steps: [
      {
        number: '1',
        left: 'FUEL CONTROL switches (both)',
        right: 'CUTOFF, then RUN',
      },
      {
        number: '2',
        left: 'RAM AIR TURBINE switch',
        right: 'Push and hold for 1 second',
      },
    ],
  },
  {
    id: 'b787-eng-autostart-l-r',
    aircraft: ['b787'],
    title: '[] ENG AUTOSTART L, R',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: ['Autostart did not start the engine.'],
    steps: [
      {
        number: '1',
        left: 'FUEL CONTROL switch (affected side)',
        right: 'Confirm, CUTOFF',
      },
    ],
  },
  {
    id: 'b787-eng-limit-exceed-l-r',
    aircraft: ['b787'],
    title: '[] ENG LIMIT EXCEED L, R',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: ['An engine limit exceedance occurs.'],
    steps: [
      {
        number: '1',
        left: 'A/T ARM switch (affected side)',
        right: 'Confirm, OFF',
      },
      {
        number: '2',
        left: 'Thrust lever (affected side)',
        right: 'Confirm, Retard until ENG LIMIT EXCEED message blanks or the thrust lever is at idle',
      },
    ],
  },
  {
    id: 'b787-eng-surge-l-r',
    aircraft: ['b787'],
    title: '[] ENG SURGE L, R',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: ['An engine surge or stall that requires crew action is detected.'],
    steps: [
      {
        number: '1',
        left: 'A/T ARM switch (affected side)',
        right: 'Confirm, OFF',
      },
      {
        number: '2',
        left: 'Thrust lever (affected side)',
        right: 'Confirm, Retard until the ENG SURGE message blanks or the thrust lever is at idle',
      },
    ],
  },
  {
    id: 'b787-eng-svr-damage-sep-l-r',
    aircraft: ['b787'],
    title: 'Eng Svr Damage/Sep L, R',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: [
      'One or more of these occur:',
      'Airframe vibrations with abnormal engine indications',
      'Engine separation',
    ],
    visualAids: [
      {
        title: 'Engine Failure After V1',
        imageSrc: `${B787_MEMORY_DIAGRAM_BASE_PATH}/b787-engine-failure-after-v1.png`,
        description: 'B787 engine failure after V1 maneuver flow.',
        alt: 'B787 Engine Failure After V1 maneuver flow',
      },
    ],
    steps: [
      {
        number: '1',
        left: 'A/T ARM switch (affected side)',
        right: 'Confirm, OFF',
      },
      {
        number: '2',
        left: 'Thrust lever (affected side)',
        right: 'Confirm, Idle',
      },
      {
        number: '3',
        left: 'FUEL CONTROL switch (affected side)',
        right: 'Confirm, CUTOFF',
      },
      {
        number: '4',
        left: 'Engine fire switch (affected side)',
        right: 'Confirm, Pull',
      },
    ],
  },
  {
    id: 'b787-fire-eng-l-r',
    aircraft: ['b787'],
    title: '[] FIRE ENG L, R',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: ['Fire is detected in the affected engine.'],
    visualAids: [
      {
        title: 'Engine Failure After V1',
        imageSrc: `${B787_MEMORY_DIAGRAM_BASE_PATH}/b787-engine-failure-after-v1.png`,
        description: 'B787 engine failure after V1 maneuver flow.',
        alt: 'B787 Engine Failure After V1 maneuver flow',
      },
    ],
    steps: [
      {
        number: '1',
        left: 'Choose one:',
        right: '',
        substeps: [
          {
            left: 'On the ground:',
            right: '',
            bold: true,
          },
          {
            left: '►►Go to step 13',
            right: '',
            bold: true,
          },
          {
            left: 'In flight:',
            right: '',
            bold: true,
          },
          {
            left: '►►Go to step 2',
            right: '',
            bold: true,
          },
        ],
      },
      {
        number: '2',
        left: 'A/T ARM switch (affected side)',
        right: 'Confirm, OFF',
      },
      {
        number: '3',
        left: 'Thrust lever (affected side)',
        right: 'Confirm, Idle',
      },
      {
        number: '4',
        left: 'FUEL CONTROL switch (affected side)',
        right: 'Confirm, CUTOFF',
      },
      {
        number: '5',
        left: 'Engine fire switch (affected side)',
        right: 'Confirm, Pull',
      },
      {
        number: '6',
        left: 'If the FIRE ENG message stays shown:',
        right: '',
        emphasis: ['If'],
        substeps: [
          {
            left: 'Engine fire switch (affected side)',
            right: 'Rotate to the stop and hold for 1 second',
          },
        ],
      },
    ],
  },
  {
    id: 'b787-stabilizer',
    aircraft: ['b787'],
    title: '[] STABILIZER',
    category: 'Non-Normal Checklist',
    topic: 'Memory Items',
    priority: 'critical',
    conditions: [
      'One of these occurs:',
      'Stabilizer movement without a signal to trim',
      'The stabilizer is failed',
    ],
    steps: [
      {
        number: '1',
        left: 'STAB cutout switches (both)',
        right: 'CUTOUT',
      },
      {
        number: '2',
        left: 'Do not exceed the current airspeed.',
        right: '',
      },
    ],
  },
]
