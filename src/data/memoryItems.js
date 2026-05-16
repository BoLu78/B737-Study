export const MEMORY_ITEMS = [
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
]
