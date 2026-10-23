// Evaluated before any other main-process module, so stores open the right profile.
import { app } from 'electron';

app.setName('Rye');
if (process.env.RYE_USER_DATA) app.setPath('userData', process.env.RYE_USER_DATA);
