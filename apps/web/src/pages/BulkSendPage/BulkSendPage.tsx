import { Link, useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { BulkSendPanel, isBulkSendEnabled } from '@/features/bulkSend';

const Page = styled.div`
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[4]} ${theme.space[20]}`};
`;

const Crumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

const CrumbLink = styled(Link)`
  color: ${({ theme }) => theme.color.fg[3]};
  border-radius: ${({ theme }) => theme.radius.xs};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

const Title = styled.h1`
  margin: ${({ theme }) => `${theme.space[4]} 0 ${theme.space[6]}`};
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};

  @media (min-width: 768px) {
    font-size: ${({ theme }) => theme.font.size.h2};
  }
`;

const Unavailable = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[2]};
`;

/**
 * `/templates/:id/bulk-send` (upload) and `/templates/:id/bulk-send/:batchId`
 * (preview, then progress). With the `bulkSend` flag off it says the feature
 * is not available and makes no API call.
 */
export function BulkSendPage() {
  const { id = '', batchId } = useParams<{ id: string; batchId?: string }>();
  const navigate = useNavigate();
  const base = `/templates/${encodeURIComponent(id)}/bulk-send`;

  return (
    <Page>
      <Crumbs aria-label="Breadcrumb">
        <CrumbLink to="/templates">Templates</CrumbLink>
        <span aria-hidden>/</span>
        <span aria-current="page">Bulk send</span>
      </Crumbs>
      <Title>Bulk send</Title>
      {isBulkSendEnabled() ? (
        <BulkSendPanel
          templateId={id}
          batchId={batchId}
          onBatchCreated={(created) => {
            navigate(`${base}/${created}`);
          }}
          onStartOver={() => {
            navigate(base);
          }}
          backTo="/templates"
        />
      ) : (
        <Unavailable>Bulk send isn&apos;t available yet.</Unavailable>
      )}
    </Page>
  );
}
