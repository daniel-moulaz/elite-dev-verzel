import { Role } from '../src/generated/prisma/enums.js'

export const DEMO_PASSWORD = 'Demo@123'

export const DEMO_SESSION_IDS = {
  interstellarEarly: '11111111-1111-4111-8111-111111111111',
  matrixTicket: '22222222-2222-4222-8222-222222222222',
  interstellarLate: '66666666-6666-4666-8666-666666666661',
  interstellarSecondDay: '66666666-6666-4666-8666-666666666662',
  matrixMiddle: '77777777-7777-4777-8777-777777777771',
  matrixLate: '77777777-7777-4777-8777-777777777772',
  godfatherEarly: '88888888-8888-4888-8888-888888888881',
  godfatherLate: '88888888-8888-4888-8888-888888888882',
  godfatherDraft: '99999999-9999-4999-8999-999999999999',
} as const

export const DEMO_PUBLISHED_SESSION_IDS = [
  DEMO_SESSION_IDS.interstellarEarly,
  DEMO_SESSION_IDS.matrixTicket,
  DEMO_SESSION_IDS.interstellarLate,
  DEMO_SESSION_IDS.interstellarSecondDay,
  DEMO_SESSION_IDS.matrixMiddle,
  DEMO_SESSION_IDS.matrixLate,
  DEMO_SESSION_IDS.godfatherEarly,
  DEMO_SESSION_IDS.godfatherLate,
] as const

export const DEMO_TICKET_ID = '55555555-5555-4555-8555-555555555555'

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
