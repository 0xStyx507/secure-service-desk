import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const KEY_LENGTH = 64;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await this.derive(password, salt, KEY_LENGTH, COST, BLOCK_SIZE, PARALLELIZATION);

    return [
      'scrypt',
      COST,
      BLOCK_SIZE,
      PARALLELIZATION,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const [algorithm, costValue, blockSizeValue, parallelizationValue, saltValue, hashValue] =
      storedHash.split('$');

    if (
      algorithm !== 'scrypt' ||
      !costValue ||
      !blockSizeValue ||
      !parallelizationValue ||
      !saltValue ||
      !hashValue
    ) {
      return false;
    }

    const expected = Buffer.from(hashValue, 'base64url');
    const derived = await this.derive(
      password,
      Buffer.from(saltValue, 'base64url'),
      expected.length,
      Number(costValue),
      Number(blockSizeValue),
      Number(parallelizationValue),
    );

    return expected.length === derived.length && timingSafeEqual(expected, derived);
  }

  private derive(
    password: string,
    salt: Buffer,
    keyLength: number,
    cost: number,
    blockSize: number,
    parallelization: number,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scryptCallback(
        password,
        salt,
        keyLength,
        {
          N: cost,
          r: blockSize,
          p: parallelization,
          maxmem: 64 * 1024 * 1024,
        },
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(derivedKey);
        },
      );
    });
  }
}
