import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { prisma } from '../index';

// Phase 2 placeholder seed — original sample copy (not client content).
// Idempotent: every row is upserted by its unique field, so re-running
// `prisma db seed` never duplicates rows. Real content arrives in Phase 0/10.
//
// NO PLACEHOLDER URLS. An earlier version of this file pointed
// MachineCategory.image, Machine.datasheetUrl, MachineImage.url,
// Partner.logo and NewsPost.image at root-relative paths under
// /images/seed and /datasheets/seed. Those files were never committed, so
// every one of them 404'd — and worse, the Phase 13 URL rules only accept
// absolute http(s) URLs, so a seeded row could not be opened and saved
// again without first deleting the very images it was meant to show. All
// of those fields are now left null and the gallery loop is gone. The
// public site already degrades gracefully (ImageWithFallback draws a
// letter tile, and the admin list uses AdminThumb), and real media arrives
// through the Cloudinary upload flow once Colina's content is ready.
async function main() {
  const categories = await Promise.all(
    [
      {
        slug: 'production-lines',
        nameAr: 'خطوط الإنتاج',
        nameEn: 'Production Lines',
        descriptionAr: 'خطوط إنتاج كاملة لقطاع الصناعات الغذائية.',
        descriptionEn: 'Complete production lines for the food industry.',
        image: null,
      },
      {
        slug: 'packaging-machines',
        nameAr: 'آلات التغليف',
        nameEn: 'Packaging Machines',
        descriptionAr: 'آلات تغليف وتعبئة للمنتجات الغذائية.',
        descriptionEn: 'Packaging and filling machines for food products.',
        image: null,
      },
      {
        slug: 'conveying-systems',
        nameAr: 'أنظمة النقل',
        nameEn: 'Conveying Systems',
        descriptionAr: 'سيور وأنظمة نقل للمواد والمنتجات.',
        descriptionEn: 'Belts and conveying systems for materials.',
        image: null,
      },
    ].map((c) =>
      prisma.machineCategory.upsert({
        where: { slug: c.slug },
        update: c,
        create: c,
      })
    )
  );

  const bySlug = Object.fromEntries(categories.map((c) => [c.slug, c]));

  const machines = await Promise.all(
    [
      {
        slug: 'colina-pro-1000',
        nameAr: 'خط كولينا برو 1000',
        nameEn: 'Colina Pro 1000',
        categoryId: bySlug['production-lines'].id,
        shortDescriptionAr: 'خط إنتاج متكامل بسعة متوسطة.',
        shortDescriptionEn: 'Integrated mid-capacity production line.',
        descriptionAr: 'وصف تفصيلي مؤقت لخط الإنتاج.',
        descriptionEn: 'Temporary detailed description of the line.',
        specsAr: 'السعة: 1000 وحدة/ساعة.',
        specsEn: 'Capacity: 1000 units/hour.',
        // The flagship machine the home page's featured strip leads with, and
        // the one seeded ON. `featured` defaults to false so a machine an
        // admin creates never appears on the marketing site uninvited — which
        // left a fresh database with nothing featured at all, and the strip
        // renders no section whatsoever when its query is empty. One flagged
        // machine is the minimum for the home page to look like the site it
        // is meant to be, with no manual database edit after seeding.
        //
        // Because this is part of the seeded data, re-seeding restores it
        // exactly as it restores every other field here. Un-flagging it in
        // the admin is therefore a demo-data change a re-seed undoes, not a
        // durable curation — deliberate, and the same "land on the same shape
        // as a fresh database" rule the stale-gallery delete below follows.
        featured: true,
        datasheetUrl: null,
      },
      {
        slug: 'colina-pro-2000',
        nameAr: 'خط كولينا برو 2000',
        nameEn: 'Colina Pro 2000',
        categoryId: bySlug['production-lines'].id,
        shortDescriptionAr: 'خط إنتاج عالي السعة.',
        shortDescriptionEn: 'High-capacity production line.',
        descriptionAr: 'وصف تفصيلي مؤقت لخط الإنتاج.',
        descriptionEn: 'Temporary detailed description of the line.',
        specsAr: 'السعة: 2000 وحدة/ساعة.',
        specsEn: 'Capacity: 2000 units/hour.',
        datasheetUrl: null,
      },
      {
        slug: 'colina-pack-s',
        nameAr: 'آلة التغليف S',
        nameEn: 'Colina Pack S',
        categoryId: bySlug['packaging-machines'].id,
        shortDescriptionAr: 'آلة تغليف مدمجة.',
        shortDescriptionEn: 'Compact packaging machine.',
        descriptionAr: 'وصف تفصيلي مؤقت لآلة التغليف.',
        descriptionEn: 'Temporary detailed description of the packer.',
        specsAr: 'السرعة: 60 عبوة/دقيقة.',
        specsEn: 'Speed: 60 packs/minute.',
        datasheetUrl: null,
      },
      {
        slug: 'colina-belt-500',
        nameAr: 'سير النقل 500',
        nameEn: 'Colina Belt 500',
        categoryId: bySlug['conveying-systems'].id,
        shortDescriptionAr: 'سير نقل بعرض 500 ملم.',
        shortDescriptionEn: '500 mm wide conveyor belt.',
        descriptionAr: 'وصف تفصيلي مؤقت لسير النقل.',
        descriptionEn: 'Temporary detailed description of the belt.',
        specsAr: 'العرض: 500 ملم.',
        specsEn: 'Width: 500 mm.',
        datasheetUrl: null,
      },
    ].map((m) =>
      prisma.machine.upsert({
        where: { slug: m.slug },
        update: m,
        create: m,
      })
    )
  );

  // No gallery rows are created. `MachineImage.url` is required and only
  // accepts an absolute http(s) URL, so a seeded placeholder would both 404
  // and block the machine from being saved again. The delete clears rows
  // written by earlier versions of this seed, so re-seeding an existing dev
  // database lands on the same shape as a fresh one. The ids are the
  // deterministic `seed-<slug>-<position>` the old seed used, so nothing an
  // admin uploaded through the real flow is touched.
  const staleGallery = await prisma.machineImage.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  if (staleGallery.count > 0) {
    console.log(
      `Removed ${staleGallery.count} placeholder gallery image(s) from a previous seed.`
    );
  }

  // Related machines (directional links — seed both ways for a symmetric
  // pair). `set` (not `connect`) keeps re-runs idempotent.
  const pro1000 = machines.find((m) => m.slug === 'colina-pro-1000');
  const pro2000 = machines.find((m) => m.slug === 'colina-pro-2000');
  if (pro1000 && pro2000) {
    await prisma.machine.update({
      where: { id: pro1000.id },
      data: { relatedMachines: { set: [{ id: pro2000.id }] } },
    });
    await prisma.machine.update({
      where: { id: pro2000.id },
      data: { relatedMachines: { set: [{ id: pro1000.id }] } },
    });
  }

  await Promise.all(
    [
      {
        slug: 'preventive-maintenance',
        titleAr: 'الصيانة الوقائية',
        titleEn: 'Preventive Maintenance',
        descriptionAr: 'برامج صيانة دورية لخطوط الإنتاج.',
        descriptionEn: 'Scheduled maintenance programs for lines.',
        scopeAr: 'فحص دوري، تشحيم، معايرة.',
        scopeEn: 'Periodic inspection, lubrication, calibration.',
        icon: 'wrench',
      },
      {
        slug: 'emergency-repair',
        titleAr: 'الإصلاح الطارئ',
        titleEn: 'Emergency Repair',
        descriptionAr: 'تدخل سريع عند الأعطال.',
        descriptionEn: 'Rapid response to breakdowns.',
        scopeAr: 'تشخيص وإصلاح خلال 48 ساعة.',
        scopeEn: 'Diagnosis and repair within 48 hours.',
        icon: 'siren',
      },
      {
        slug: 'spare-parts',
        titleAr: 'قطع الغيار',
        titleEn: 'Spare Parts',
        descriptionAr: 'توفير قطع الغيار الأصلية.',
        descriptionEn: 'Supply of genuine spare parts.',
        scopeAr: 'كتالوج قطع الغيار والتوريد.',
        scopeEn: 'Parts catalog and supply.',
        icon: 'cog',
      },
    ].map((s) =>
      prisma.maintenanceService.upsert({
        where: { slug: s.slug },
        update: s,
        create: s,
      })
    )
  );

  await Promise.all(
    ['seed-partner-a', 'seed-partner-b', 'seed-partner-c'].map((name) =>
      prisma.partner.upsert({
        where: { id: name },
        // Deliberately empty: these rows are seed-owned by id, but a partner
        // may have had its real logo uploaded through the admin, and
        // re-seeding must not wipe that. The placeholder is cleared
        // separately below instead.
        update: {},
        create: {
          id: name,
          nameAr: `شريك تجريبي ${name.slice(-1).toUpperCase()}`,
          nameEn: `Seed Partner ${name.slice(-1).toUpperCase()}`,
          logo: null,
        },
      })
    )
  );

  // Clears the placeholder logo left by an earlier version of this seed, which
  // the empty `update` above cannot reach. Matched on the exact
  // `/images/seed/` prefix, so a real Cloudinary upload — the only other way a
  // logo can get here — is never touched.
  const staleLogos = await prisma.partner.updateMany({
    where: { logo: { startsWith: '/images/seed/' } },
    data: { logo: null },
  });
  if (staleLogos.count > 0) {
    console.log(
      `Cleared ${staleLogos.count} placeholder partner logo(s) from a previous seed.`
    );
  }

  await Promise.all(
    [
      {
        id: 'seed-agent-cairo',
        countryAr: 'مصر',
        countryEn: 'Egypt',
        cityAr: 'القاهرة',
        cityEn: 'Cairo',
        phone: '+20 2 0000 0000',
        email: 'cairo@example.com',
      },
      {
        id: 'seed-agent-riyadh',
        countryAr: 'السعودية',
        countryEn: 'Saudi Arabia',
        cityAr: 'الرياض',
        cityEn: 'Riyadh',
        phone: '+966 11 000 0000',
        email: 'riyadh@example.com',
      },
    ].map((a) =>
      prisma.agent.upsert({
        where: { id: a.id },
        update: a,
        create: a,
      })
    )
  );

  await Promise.all(
    [
      {
        slug: 'seed-news-launch',
        titleAr: 'خبر تجريبي: الإطلاق',
        titleEn: 'Seed News: Launch',
        bodyAr: 'نص تجريبي لخبر الإطلاق.',
        bodyEn: 'Seed body for the launch post.',
        image: null,
      },
      {
        slug: 'seed-news-service',
        titleAr: 'خبر تجريبي: الصيانة',
        titleEn: 'Seed News: Service',
        bodyAr: 'نص تجريبي لخبر الصيانة.',
        bodyEn: 'Seed body for the service post.',
        image: null,
      },
    ].map((n) =>
      prisma.newsPost.upsert({
        where: { slug: n.slug },
        update: n,
        create: n,
      })
    )
  );

  await prisma.contactMessage.upsert({
    where: { id: 'seed-contact-1' },
    update: {},
    create: {
      id: 'seed-contact-1',
      name: 'Seed Contact',
      email: 'contact@example.com',
      phone: '+20 100 000 0000',
      message: 'Seed contact message.',
      status: 'NEW',
    },
  });

  await prisma.maintenanceRequest.upsert({
    where: { id: 'seed-maint-1' },
    update: {},
    create: {
      id: 'seed-maint-1',
      name: 'Seed Requester',
      company: 'Seed Foods Co.',
      phone: '+20 100 000 0001',
      email: 'requester@example.com',
      machineModel: 'Colina Pro 1000',
      message: 'Seed maintenance request.',
      status: 'NEW',
    },
  });

  // Seed admin password: read from the environment so no plaintext —
  // real or fake — is ever committed. Without SEED_ADMIN_PASSWORD a
  // random one is generated, hashed with argon2id, and printed ONCE
  // (never stored). Re-seeding resets the password and prints again.
  const seedPassword =
    process.env.SEED_ADMIN_PASSWORD ?? randomBytes(24).toString('base64url');
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(
      'SEED_ADMIN_PASSWORD is not set — generated random admin password (shown once, never stored):'
    );
    console.log(`admin@example.com / ${seedPassword}`);
  }
  const admin = await prisma.adminUser.upsert({
    where: { email: 'admin@example.com' },
    update: { passwordHash: await argon2.hash(seedPassword) },
    create: {
      email: 'admin@example.com',
      passwordHash: await argon2.hash(seedPassword),
      role: 'SUPER_ADMIN',
    },
  });

  await prisma.auditLog.upsert({
    where: { id: 'seed-audit-1' },
    update: {},
    create: {
      id: 'seed-audit-1',
      adminUserId: admin.id,
      action: 'SEED',
      entity: 'database',
    },
  });

  console.log('Seed completed.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
