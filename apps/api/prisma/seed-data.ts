import { Role } from '../src/generated/prisma/enums.js'

export const DEMO_PASSWORD = 'Demo@123'

export const DEMO_USERS = [
  {
    name: 'Organizador Demo',
    email: 'organizer@demo.local',
    role: Role.ORGANIZER,
  },
  {
    name: 'Cliente Demo 1',
    email: 'customer1@demo.local',
    role: Role.CUSTOMER,
  },
  {
    name: 'Cliente Demo 2',
    email: 'customer2@demo.local',
    role: Role.CUSTOMER,
  },
  {
    name: 'Portaria Demo',
    email: 'gate@demo.local',
    role: Role.GATE,
  },
] as const
