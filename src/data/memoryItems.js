export const MEMORY_ITEMS = [
  {
    id: 'aborted-engine-start',
    title: 'Aborted Engine Start',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Engines',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Engine start lever (affected engine)',
        right: 'CUTOFF',
      },
    ],
  },
  {
    id: 'airspeed-unreliable-stick-shaker-cb',
    title: 'Airspeed Unreliable',
    subtitle: 'Stick Shaker Deactivation by Pulling Circuit Breaker',
    category: 'Non-Normal Checklist',
    topic: 'Flight Instruments',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Autopilot (if engaged)',
        right: 'Disengage',
      },
      {
        number: '2',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
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
            right: '10° and 80% N1',
          },
          {
            left: 'Flaps up',
            right: '4° and 75% N1',
          },
        ],
      },
    ],
  },
  {
    id: 'apu-fire',
    title: 'APU FIRE',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Fire Protection',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'APU fire switch',
        right: 'Confirm, pull, rotate to the stop, and hold for 1 second',
      },
      {
        number: '2',
        left: 'APU switch',
        right: 'OFF',
      },
    ],
  },
  {
    id: 'cabin-altitude-warning',
    title: 'Cabin Altitude Warning',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Pressurization',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Don oxygen masks and set regulators to 100%',
        right: '',
      },
      {
        number: '2',
        left: 'Establish crew communications',
        right: '',
      },
      {
        number: '3',
        left: 'Pressurization mode selector',
        right: 'MAN',
      },
      {
        number: '4',
        left: 'Outflow VALVE switch',
        right: 'Hold in CLOSE until the outflow VALVE indication shows fully closed',
      },
      {
        number: '5',
        left: 'If cabin altitude is uncontrollable',
        right: '',
        substeps: [
          {
            left: 'Passenger signs',
            right: 'ON',
          },
          {
            left: 'PASS OXYGEN switch',
            right: 'ON',
          },
          {
            left: 'Go to the Emergency Descent checklist on page 0.1',
            right: '',
          },
        ],
      },
    ],
  },
  {
    id: 'rapid-depressurization',
    title: 'Rapid Depressurization',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Pressurization',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Don oxygen masks and set regulators to 100%',
        right: '',
      },
      {
        number: '2',
        left: 'Establish crew communications',
        right: '',
      },
      {
        number: '3',
        left: 'Pressurization mode selector',
        right: 'MAN',
      },
      {
        number: '4',
        left: 'Outflow VALVE switch',
        right: 'Hold in CLOSE until the outflow VALVE indication shows fully closed',
      },
      {
        number: '5',
        left: 'If cabin altitude is uncontrollable',
        right: '',
        substeps: [
          {
            left: 'Passenger signs',
            right: 'ON',
          },
          {
            left: 'PASS OXYGEN switch',
            right: 'ON',
          },
          {
            left: 'Go to the Emergency Descent checklist on page 0.1',
            right: '',
          },
        ],
      },
    ],
  },
  {
    id: 'emergency-descent',
    title: 'Emergency Descent',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Pressurization',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Without delay, descend to the lowest safe altitude or 10,000 feet, whichever is higher',
        right: '',
      },
      {
        number: '2',
        left: 'ENGINE START switches (both)',
        right: 'CONT',
      },
      {
        number: '3',
        left: 'Thrust levers (both)',
        right: 'Reduce thrust to minimum or as needed for anti-ice',
      },
      {
        number: '4',
        left: 'Speedbrake',
        right: 'FLIGHT DETENT',
      },
      {
        number: '5',
        left: 'Set target speed to Mmo/Vmo',
        right: '',
      },
      {
        number: '6',
        left: 'Announce the emergency descent. The pilot flying will advise the cabin crew, on the PA system, of impending rapid descent. The pilot monitoring will advise ATC and obtain the area altimeter setting',
        right: '',
      },
      {
        number: '7',
        left: 'Passenger signs',
        right: 'ON',
      },
    ],
  },
  {
    id: 'engine-fire',
    title: 'Engine Fire',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Fire Protection',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
      },
      {
        number: '2',
        left: 'Thrust lever (affected engine)',
        right: 'Confirm, close',
      },
      {
        number: '3',
        left: 'Engine start lever (affected engine)',
        right: 'Confirm, CUTOFF',
      },
      {
        number: '4',
        left: 'Engine fire switch (affected engine)',
        right: 'Confirm, pull',
      },
      {
        number: '5',
        left: 'If the engine fire switch or ENG OVERHEAT light is illuminated',
        right: '',
        substeps: [
          {
            left: 'Engine fire switch (affected engine)',
            right: 'Rotate to the stop and hold for 1 second',
          },
        ],
      },
    ],
  },
  {
    id: 'engine-severe-damage',
    title: 'Engine Severe Damage',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Engines',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
      },
      {
        number: '2',
        left: 'Thrust lever (affected engine)',
        right: 'Confirm, close',
      },
      {
        number: '3',
        left: 'Engine start lever (affected engine)',
        right: 'Confirm, CUTOFF',
      },
      {
        number: '4',
        left: 'Engine fire switch (affected engine)',
        right: 'Confirm, pull',
      },
      {
        number: '5',
        left: 'If the engine fire switch or ENG OVERHEAT light is illuminated',
        right: '',
        substeps: [
          {
            left: 'Engine fire switch (affected engine)',
            right: 'Rotate to the stop and hold for 1 second',
          },
        ],
      },
    ],
  },
  {
    id: 'engine-separation',
    title: 'Engine Separation',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Engines',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
      },
      {
        number: '2',
        left: 'Thrust lever (affected engine)',
        right: 'Confirm, close',
      },
      {
        number: '3',
        left: 'Engine start lever (affected engine)',
        right: 'Confirm, CUTOFF',
      },
      {
        number: '4',
        left: 'Engine fire switch (affected engine)',
        right: 'Confirm, pull',
      },
      {
        number: '5',
        left: 'If the engine fire switch or ENG OVERHEAT light is illuminated',
        right: '',
        substeps: [
          {
            left: 'Engine fire switch (affected engine)',
            right: 'Rotate to the stop and hold for 1 second',
          },
        ],
      },
    ],
  },
  {
    id: 'engine-limit',
    title: 'Engine Limit',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Engines',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
      },
      {
        number: '2',
        left: 'Thrust lever (affected engine)',
        right: 'Confirm, retard until engine indications stay within limits or the thrust lever is closed',
      },
    ],
  },
  {
    id: 'engine-surge',
    title: 'Engine Surge',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Engines',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
      },
      {
        number: '2',
        left: 'Thrust lever (affected engine)',
        right: 'Confirm, retard until engine indications stay within limits or the thrust lever is closed',
      },
    ],
  },
  {
    id: 'engine-stall',
    title: 'Engine Stall',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Engines',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
      },
      {
        number: '2',
        left: 'Thrust lever (affected engine)',
        right: 'Confirm, retard until engine indications stay within limits or the thrust lever is closed',
      },
    ],
  },
  {
    id: 'engine-overheat',
    title: 'Engine Overheat',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Fire Protection',
    priority: 'critical',
    visualCues: [
      {
        type: 'warning-light',
        lines: ['ENG 1', 'OVERHEAT'],
      },
      {
        type: 'warning-light',
        lines: ['ENG 2', 'OVERHEAT'],
      },
    ],
    steps: [
      {
        number: '1',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
      },
      {
        number: '2',
        left: 'Thrust lever (affected engine)',
        right: 'Confirm, close',
      },
      {
        number: '3',
        left: 'If the ENG OVERHEAT light stays illuminated',
        right: '',
        substeps: [
          {
            left: 'Go to the ENGINE FIRE or Engine Severe Damage or Separation checklist on page 8.2',
            right: '',
          },
        ],
      },
    ],
  },
  {
    id: 'landing-configuration',
    title: 'Landing Configuration',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Warning Systems',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Assure correct airplane landing configuration',
        right: '',
      },
    ],
  },
  {
    id: 'takeoff-configuration',
    title: 'Takeoff Configuration',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Warning Systems',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Assure correct airplane takeoff configuration',
        right: '',
      },
    ],
  },
  {
    id: 'loss-of-thrust-on-both-engines',
    title: 'Loss Of Thrust On Both Engines',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Engines',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'ENGINE START switches (both)',
        right: 'FLT',
      },
      {
        number: '2',
        left: 'Engine start levers (both)',
        right: 'CUTOFF',
      },
      {
        number: '3',
        left: 'When EGT decreases',
        right: '',
        substeps: [
          {
            left: 'Engine start levers (both)',
            right: 'IDLE detent',
          },
        ],
      },
      {
        number: '4',
        left: 'If EGT reaches a redline or there is no increase in EGT within 30 seconds',
        right: '',
        substeps: [
          {
            left: 'Engine start lever (affected engine)',
            right: 'Confirm, CUTOFF, then IDLE detent',
          },
          {
            left: 'If EGT again reaches a redline or there is no increase in EGT within 30 seconds, repeat as needed',
            right: '',
          },
        ],
      },
    ],
  },
  {
    id: 'runaway-stabilizer',
    title: 'Runaway Stabilizer',
    subtitle: '',
    category: 'Non-Normal Checklist',
    topic: 'Flight Controls',
    priority: 'critical',
    steps: [
      {
        number: '1',
        left: 'Control column',
        right: 'Hold firmly',
      },
      {
        number: '2',
        left: 'Autopilot (if engaged)',
        right: 'Disengage',
      },
      {
        number: '3',
        left: 'Autothrottle (if engaged)',
        right: 'Disengage',
      },
      {
        number: '4',
        left: 'Control column and thrust levers',
        right: 'Control airplane pitch attitude and airspeed',
      },
      {
        number: '5',
        left: 'Main Electric Stabilizer trim',
        right: 'Reduce control column forces',
      },
      {
        number: '6',
        left: 'If the runaway stops after the autopilot is disengaged',
        right: '',
        substeps: [
          {
            left: 'Do not re-engage the autopilot or autothrottle',
            right: '',
          },
        ],
      },
      {
        number: '7',
        left: 'If the runaway continues after the autopilot is disengaged',
        right: '',
        substeps: [
          {
            left: 'STAB TRIM cutout switches (both)',
            right: 'CUTOUT',
          },
          {
            left: 'If the runaway continues',
            right: '',
          },
          {
            left: 'Stabilizer trim wheel',
            right: 'Grasp and hold',
          },
        ],
      },
    ],
  },
]
