import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContactDto } from './create-contact.dto';
import { UpdateContactDto } from './update-contact.dto';

describe('CreateContactDto', () => {
  it('trims and lowercases email on transform', () => {
    const dto = plainToInstance(CreateContactDto, {
      name: 'Ada',
      email: '  ADA@example.COM  ',
      color: '#ABCDEF',
    });
    expect(dto.email).toBe('ada@example.com');
  });

  it('rejects invalid hex color', async () => {
    const dto = plainToInstance(CreateContactDto, {
      name: 'Ada',
      email: 'ada@example.com',
      color: 'red',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('color');
  });

  it('rejects empty name', async () => {
    const dto = plainToInstance(CreateContactDto, { name: '', email: 'a@b.c', color: '#000000' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('name');
  });

  it('rejects non-email', async () => {
    const dto = plainToInstance(CreateContactDto, {
      name: 'Ada',
      email: 'not-an-email',
      color: '#000000',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('email');
  });
});

describe('UpdateContactDto', () => {
  it('accepts an empty object', async () => {
    const dto = plainToInstance(UpdateContactDto, {});
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('validates individual fields when present', async () => {
    const dto = plainToInstance(UpdateContactDto, { email: 'nope' });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('email');
  });

  it('trims + lowercases email when present', () => {
    const dto = plainToInstance(UpdateContactDto, { email: '  FOO@BAR.IO ' });
    expect(dto.email).toBe('foo@bar.io');
  });
});
